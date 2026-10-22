//! The search index in `.benchwork/index.sqlite`. The front end reads the
//! pages and sends what it found (title, tags, links, plain text); this
//! module stores it and answers searches with SQLite's FTS5. The index is
//! disposable: vault files are the source of truth, so if it is from an
//! older version or cannot be read, it is deleted and built again.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{ErrorKind, VaultError, VaultResult};

/// Bump when the schema changes; older indexes are then rebuilt.
const SCHEMA_VERSION: i64 = 1;

/// Marks around matched words in snippets. Control characters, so they can
/// never clash with page text or be read as HTML.
pub const MATCH_START: char = '\u{2}';
pub const MATCH_END: char = '\u{3}';

const SCHEMA: &str = "
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE notes (
        rowid INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        id TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        created TEXT,
        modified TEXT,
        mtime INTEGER,
        size INTEGER NOT NULL
    );
    CREATE INDEX notes_id ON notes (id);
    CREATE TABLE links (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        key TEXT NOT NULL,
        embed INTEGER NOT NULL
    );
    CREATE INDEX links_source ON links (source);
    CREATE INDEX links_key ON links (key);
    CREATE TABLE tags (path TEXT NOT NULL, tag TEXT NOT NULL);
    CREATE INDEX tags_path ON tags (path);
    CREATE INDEX tags_tag ON tags (tag);
    CREATE VIRTUAL TABLE fts USING fts5(
        title, tags, body,
        tokenize = 'unicode61 remove_diacritics 2'
    );
";

/// A page as the front end read it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedPage {
    pub path: String,
    pub id: Option<String>,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub created: Option<String>,
    pub modified: Option<String>,
    /// File modified time in ms, to tell next time whether it changed.
    pub mtime: Option<u64>,
    pub size: u64,
    pub tags: Vec<String>,
    pub links: Vec<IndexedLink>,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedLink {
    /// As written, such as `Climbing assay` or `attachments/plot.png`.
    pub target: String,
    /// Normalised for matching: lower case, no `.md`, no `#heading`.
    pub key: String,
    pub embed: bool,
}

/// What the index holds for one file, for working out what changed.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    pub path: String,
    pub mtime: Option<u64>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    /// Text around the match, with matched words between MATCH_START and MATCH_END.
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenInfo {
    /// True if the index started empty, so every page must be read.
    pub fresh: bool,
}

fn db_error(context: &str, err: &rusqlite::Error) -> VaultError {
    VaultError::new(ErrorKind::Io, format!("{context}: {err}"))
}

pub struct SearchIndex {
    conn: Connection,
}

impl SearchIndex {
    /// Opens the index at `file`, creating it if needed. An index that is
    /// from another version or cannot be read is deleted and made afresh.
    pub fn open(file: &Path) -> VaultResult<(Self, OpenInfo)> {
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir)
                .map_err(|e| VaultError::io("Cannot create index folder", &e))?;
        }
        let existed = file.exists();
        if existed {
            match Self::open_existing(file) {
                Ok(index) => return Ok((index, OpenInfo { fresh: false })),
                Err(_) => remove_index_files(file)?,
            }
        }
        let conn = Connection::open(file).map_err(|e| db_error("Cannot create index", &e))?;
        let index = Self::init(conn)?;
        Ok((index, OpenInfo { fresh: true }))
    }

    #[cfg(test)]
    pub fn open_in_memory() -> VaultResult<Self> {
        let conn = Connection::open_in_memory().map_err(|e| db_error("Cannot create index", &e))?;
        Self::init(conn)
    }

    fn open_existing(file: &Path) -> VaultResult<Self> {
        let conn = Connection::open(file).map_err(|e| db_error("Cannot open index", &e))?;
        configure(&conn)?;
        let version: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| db_error("Cannot read index", &e))?;
        if version.as_deref() != Some(&SCHEMA_VERSION.to_string()) {
            return Err(VaultError::new(
                ErrorKind::Io,
                "Index is from another version",
            ));
        }
        Ok(Self { conn })
    }

    fn init(conn: Connection) -> VaultResult<Self> {
        configure(&conn)?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| db_error("Cannot create index", &e))?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
            params![SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| db_error("Cannot create index", &e))?;
        Ok(Self { conn })
    }

    /// Every file the index holds, with the size and time it had when read.
    pub fn entries(&self) -> VaultResult<Vec<IndexEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT path, mtime, size FROM notes ORDER BY path")
            .map_err(|e| db_error("Cannot read index", &e))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(IndexEntry {
                    path: row.get(0)?,
                    mtime: row.get::<_, Option<i64>>(1)?.map(|m| m.max(0) as u64),
                    size: row.get::<_, i64>(2)?.max(0) as u64,
                })
            })
            .map_err(|e| db_error("Cannot read index", &e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| db_error("Cannot read index", &e))
    }

    /// Removes `removes` (each a file, or a folder and everything in it),
    /// then adds or replaces `upserts`, all in one transaction.
    pub fn apply(&mut self, upserts: &[IndexedPage], removes: &[String]) -> VaultResult<()> {
        let tx = self
            .conn
            .transaction()
            .map_err(|e| db_error("Cannot update index", &e))?;
        for path in removes {
            remove_path(&tx, path)?;
        }
        for page in upserts {
            remove_path(&tx, &page.path)?;
            insert_page(&tx, page)?;
        }
        tx.commit().map_err(|e| db_error("Cannot update index", &e))
    }

    /// Empties the index, for a rebuild.
    pub fn clear(&mut self) -> VaultResult<()> {
        self.conn
            .execute_batch(
                "DELETE FROM notes; DELETE FROM links; DELETE FROM tags; DELETE FROM fts;",
            )
            .map_err(|e| db_error("Cannot clear index", &e))
    }

    /// Pages matching `query`, best first. Titles count most, then tags.
    pub fn search(&self, query: &str, limit: usize) -> VaultResult<Vec<SearchHit>> {
        let Some(fts) = fts_query(query) else {
            return Ok(Vec::new());
        };
        let sql = format!(
            "SELECT n.path, n.title, snippet(fts, 2, '{MATCH_START}', '{MATCH_END}', '…', 16)
             FROM fts JOIN notes n ON n.rowid = fts.rowid
             WHERE fts MATCH ?1
             ORDER BY bm25(fts, 10.0, 5.0, 1.0), n.path
             LIMIT ?2"
        );
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| db_error("Cannot search", &e))?;
        let rows = stmt
            .query_map(params![fts, limit as i64], |row| {
                Ok(SearchHit {
                    path: row.get(0)?,
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                })
            })
            .map_err(|e| db_error("Cannot search", &e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| db_error("Cannot search", &e))
    }

    /// Pages with a link whose key is one of `keys`, sorted by path.
    pub fn backlinks(&self, keys: &[String]) -> VaultResult<Vec<String>> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let marks = vec!["?"; keys.len()].join(", ");
        let sql =
            format!("SELECT DISTINCT source FROM links WHERE key IN ({marks}) ORDER BY source");
        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|e| db_error("Cannot read links", &e))?;
        let rows = stmt
            .query_map(params_from_iter(keys.iter()), |row| row.get(0))
            .map_err(|e| db_error("Cannot read links", &e))?;
        rows.collect::<Result<Vec<String>, _>>()
            .map_err(|e| db_error("Cannot read links", &e))
    }
}

fn configure(conn: &Connection) -> VaultResult<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
        .map_err(|e| db_error("Cannot set up index", &e))
}

/// Deletes the index and SQLite's files beside it. These are BenchWork's
/// own disposable files, never user files.
fn remove_index_files(file: &Path) -> VaultResult<()> {
    let mut paths = vec![file.to_path_buf()];
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut name = file.as_os_str().to_owned();
        name.push(suffix);
        paths.push(PathBuf::from(name));
    }
    for path in paths {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(VaultError::io("Cannot replace old index", &e)),
        }
    }
    Ok(())
}

/// Removes `path` and everything under `path/`. For a page that is just
/// the page: a file cannot have anything under it.
fn remove_path(conn: &Connection, path: &str) -> VaultResult<()> {
    let err = |e: rusqlite::Error| db_error("Cannot update index", &e);
    let under = format!("{path}/");
    let matches = |column: &str| format!("{column} = ?1 OR substr({column}, 1, length(?2)) = ?2");
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT rowid FROM notes WHERE {}",
                matches("path")
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![path, under], |row| row.get(0))
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    for id in ids {
        conn.execute("DELETE FROM fts WHERE rowid = ?1", params![id])
            .map_err(err)?;
    }
    for (table, column) in [("notes", "path"), ("tags", "path"), ("links", "source")] {
        conn.execute(
            &format!("DELETE FROM {table} WHERE {}", matches(column)),
            params![path, under],
        )
        .map_err(err)?;
    }
    Ok(())
}

fn insert_page(conn: &Connection, page: &IndexedPage) -> VaultResult<()> {
    let err = |e: rusqlite::Error| db_error("Cannot update index", &e);
    conn.execute(
        "INSERT INTO notes (path, id, title, type, created, modified, mtime, size)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            page.path,
            page.id,
            page.title,
            page.kind,
            page.created,
            page.modified,
            page.mtime.map(|m| m as i64),
            page.size as i64,
        ],
    )
    .map_err(err)?;
    let rowid = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO fts (rowid, title, tags, body) VALUES (?1, ?2, ?3, ?4)",
        params![rowid, page.title, page.tags.join(" "), page.body],
    )
    .map_err(err)?;
    for tag in &page.tags {
        conn.execute(
            "INSERT INTO tags (path, tag) VALUES (?1, ?2)",
            params![page.path, tag],
        )
        .map_err(err)?;
    }
    for link in &page.links {
        conn.execute(
            "INSERT INTO links (source, target, key, embed) VALUES (?1, ?2, ?3, ?4)",
            params![page.path, link.target, link.key, link.embed],
        )
        .map_err(err)?;
    }
    Ok(())
}

/// Turns what someone typed into a safe FTS5 query: every word must appear,
/// each also matching longer words that start with it, and `"quoted
/// words"` must appear together. FTS5 syntax in the input has no effect.
/// None if there is nothing to search for.
pub fn fts_query(input: &str) -> Option<String> {
    let mut parts = Vec::new();
    for (i, chunk) in input.split('"').enumerate() {
        let words: Vec<&str> = chunk
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty())
            .collect();
        if words.is_empty() {
            continue;
        }
        // Odd chunks were inside quotes.
        if i % 2 == 1 {
            parts.push(format!("\"{}\"", words.join(" ")));
        } else {
            parts.extend(words.iter().map(|w| format!("\"{w}\"*")));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(path: &str, title: &str, body: &str) -> IndexedPage {
        IndexedPage {
            path: path.into(),
            id: None,
            title: title.into(),
            kind: "page".into(),
            created: None,
            modified: None,
            mtime: Some(1000),
            size: body.len() as u64,
            tags: Vec::new(),
            links: Vec::new(),
            body: body.into(),
        }
    }

    fn paths(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|h| h.path.as_str()).collect()
    }

    #[test]
    fn builds_safe_queries() {
        assert_eq!(
            fts_query("LPS climbing").as_deref(),
            Some("\"LPS\"* \"climbing\"*")
        );
        assert_eq!(
            fts_query("\"day 7\" flies").as_deref(),
            Some("\"day 7\" \"flies\"*")
        );
        assert_eq!(
            fts_query("LPS-model").as_deref(),
            Some("\"LPS\"* \"model\"*")
        );
        assert_eq!(
            fts_query("a OR b NOT c*").as_deref(),
            Some("\"a\"* \"OR\"* \"b\"* \"NOT\"* \"c\"*")
        );
        assert_eq!(fts_query("  \"\" * ( ) "), None);
        assert_eq!(
            fts_query("\"unclosed quote").as_deref(),
            Some("\"unclosed quote\"")
        );
    }

    #[test]
    fn finds_pages_by_word_prefix_and_phrase() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        index
            .apply(
                &[
                    page(
                        "Lab/Dose.md",
                        "Dose",
                        "LPS dose response, climbing at day 7",
                    ),
                    page("Lab/Diet.md", "Diet", "Fresh food on day 3, then climbing"),
                ],
                &[],
            )
            .unwrap();
        assert_eq!(
            paths(&index.search("clim", 10).unwrap()),
            ["Lab/Diet.md", "Lab/Dose.md"]
        );
        assert_eq!(
            paths(&index.search("LPS climbing", 10).unwrap()),
            ["Lab/Dose.md"]
        );
        assert_eq!(
            paths(&index.search("\"day 7\"", 10).unwrap()),
            ["Lab/Dose.md"]
        );
        assert!(index.search("\"climbing day\"", 10).unwrap().is_empty());
        assert!(index.search("", 10).unwrap().is_empty());
    }

    #[test]
    fn ignores_accents_and_case() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        index
            .apply(&[page("a.md", "Protéine", "Café au lait")], &[])
            .unwrap();
        assert_eq!(paths(&index.search("proteine CAFE", 10).unwrap()), ["a.md"]);
    }

    #[test]
    fn ranks_title_matches_first_and_marks_matches() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        index
            .apply(
                &[
                    page(
                        "Body.md",
                        "Notes",
                        "We talked about the western blot today.",
                    ),
                    page("Title.md", "Western blot", "Protocol."),
                ],
                &[],
            )
            .unwrap();
        let hits = index.search("western", 10).unwrap();
        assert_eq!(paths(&hits), ["Title.md", "Body.md"]);
        assert!(hits[1]
            .snippet
            .contains(&format!("{MATCH_START}western{MATCH_END}")));
    }

    #[test]
    fn finds_tags() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        let mut tagged = page("a.md", "A", "Nothing here");
        tagged.tags = vec!["climbing".into()];
        index.apply(&[tagged], &[]).unwrap();
        assert_eq!(paths(&index.search("climbing", 10).unwrap()), ["a.md"]);
    }

    #[test]
    fn replaces_pages_and_removes_files_and_folders() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        index
            .apply(
                &[
                    page("Lab/a.md", "A", "alpha"),
                    page("Lab/Sub/b.md", "B", "alpha"),
                    page("Lab2/c.md", "C", "alpha"),
                ],
                &[],
            )
            .unwrap();
        index.apply(&[page("Lab/a.md", "A", "beta")], &[]).unwrap();
        assert_eq!(
            paths(&index.search("alpha", 10).unwrap()),
            ["Lab/Sub/b.md", "Lab2/c.md"]
        );
        assert_eq!(paths(&index.search("beta", 10).unwrap()), ["Lab/a.md"]);

        // Removing a folder takes what is under it, but not a sibling that shares its prefix.
        index.apply(&[], &["Lab".into()]).unwrap();
        let left: Vec<String> = index
            .entries()
            .unwrap()
            .into_iter()
            .map(|e| e.path)
            .collect();
        assert_eq!(left, ["Lab2/c.md"]);
    }

    #[test]
    fn reports_entries_for_change_checks() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        index.apply(&[page("a.md", "A", "four")], &[]).unwrap();
        assert_eq!(
            index.entries().unwrap(),
            [IndexEntry {
                path: "a.md".into(),
                mtime: Some(1000),
                size: 4
            }]
        );
        index.clear().unwrap();
        assert!(index.entries().unwrap().is_empty());
        assert!(index.search("four", 10).unwrap().is_empty());
    }

    #[test]
    fn finds_backlinks_by_key() {
        let mut index = SearchIndex::open_in_memory().unwrap();
        let mut a = page("a.md", "A", "");
        a.links = vec![IndexedLink {
            target: "Plan".into(),
            key: "plan".into(),
            embed: false,
        }];
        let mut b = page("b.md", "B", "");
        b.links = vec![IndexedLink {
            target: "Lab/Plan".into(),
            key: "lab/plan".into(),
            embed: false,
        }];
        index.apply(&[a, b, page("c.md", "C", "")], &[]).unwrap();
        assert_eq!(
            index
                .backlinks(&["lab/plan".into(), "plan".into()])
                .unwrap(),
            ["a.md", "b.md"]
        );
        assert!(index.backlinks(&[]).unwrap().is_empty());
    }

    #[test]
    fn keeps_its_contents_between_opens_and_rebuilds_a_broken_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(".benchwork").join("index.sqlite");
        {
            let (mut index, info) = SearchIndex::open(&file).unwrap();
            assert!(info.fresh);
            index.apply(&[page("a.md", "A", "kept")], &[]).unwrap();
        }
        {
            let (index, info) = SearchIndex::open(&file).unwrap();
            assert!(!info.fresh);
            assert_eq!(paths(&index.search("kept", 10).unwrap()), ["a.md"]);
        }
        remove_index_files(&file).unwrap();
        fs::write(&file, b"not a database").unwrap();
        let (index, info) = SearchIndex::open(&file).unwrap();
        assert!(info.fresh);
        assert!(index.entries().unwrap().is_empty());
    }
}
