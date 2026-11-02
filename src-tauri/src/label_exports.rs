//! Explicit label-file exports, without granting the WebView general filesystem access.
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn save(directory: &Path, name: &str, text: &str) -> Result<PathBuf, String> {
    if text.len() > 25 * 1024 * 1024 {
        return Err("Choose a label pack below 25 MB.".into());
    }
    let value: serde_json::Value = serde_json::from_str(text).map_err(|_| "Invalid label file")?;
    let valid = value["version"] == 1
        && (value["elements"].is_array()
            || (value["format"] == "benchwork-label-pack"
                && value["labels"]
                    .as_array()
                    .is_some_and(|v| !v.is_empty() && v.len() <= 100)));
    if !valid {
        return Err("Invalid label file".into());
    }
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(60)
        .collect();
    let extension = if value["format"] == "benchwork-label-pack" {
        "labelpack.json"
    } else {
        "label.json"
    };
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!(
        "BenchWork-{}-{}.{}",
        if safe.is_empty() { "labels" } else { &safe },
        rand::random::<u64>(),
        extension
    ));
    let mut file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exports_only_label_json_to_unique_files_inside_the_chosen_directory() {
        let dir =
            std::env::temp_dir().join(format!("benchwork-label-export-{}", rand::random::<u64>()));
        let text = r#"{"version":1,"format":"benchwork-label-pack","labels":[{}]}"#;
        let a = save(&dir, "../../labels", text).unwrap();
        let b = save(&dir, "../../labels", text).unwrap();
        assert_eq!(a.parent(), Some(dir.as_path()));
        assert_ne!(a, b);
        assert_eq!(std::fs::read_to_string(&a).unwrap(), text);
        assert!(save(&dir, "bad", "{\"version\":1}").is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
