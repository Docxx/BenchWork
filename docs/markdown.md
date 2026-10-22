# How BenchWork saves Markdown

Pages are Markdown files. BenchWork reads them into the editor and writes
them back when you edit. This page says exactly what it changes.

## Untouched parts stay exactly as written

Each top-level block (a paragraph, heading, list, table, quote, code block)
remembers the Markdown it came from. When a page is saved, every block you
did not edit is written back byte for byte, including its spacing. Opening
a page never writes to it.

Frontmatter (the `---` block at the top) is handled separately and also
stays exactly as written, apart from the keys BenchWork sets, such as `id`.

The page's line endings (Windows or Unix) and a byte order mark, if any,
are kept.

## Blocks you edit use BenchWork's style

Only the block you changed is rewritten, in this style:

| Written as                                  | Saved as                               |
| ------------------------------------------- | -------------------------------------- |
| `*` or `+` bullets                          | `-` bullets                            |
| `_italic_`                                  | `*italic*`                             |
| `__bold__`                                  | `**bold**`                             |
| `***bold italic***`                         | `**_bold italic_**`                    |
| Underlined headings (`====`, `----`)        | `#` headings                           |
| `~~~` or indented code                      | ` ``` ` fenced code                    |
| `***` or `___` rules                        | `---`                                  |
| Line break with two spaces                  | Line break with `\`                    |
| Loose lists (blank lines between items)     | Tight lists                            |
| Table cells padded to line up               | Single spaces, alignment row like `:-` |
| Several blank lines next to an edited block | One blank line                         |
| Empty paragraphs                            | Left out                               |

Two lists of the same kind next to each other would merge in Markdown, so
the second one uses the other bullet (`*`), or `)` numbering.

Table cells hold one line in Markdown, so line breaks in a cell are saved
as `<br>` and separate paragraphs in a cell are joined with a space.

Inline code cannot be bold or italic in the editor, so formatting around
code is not kept if that block is edited.

## Kept raw

Some Markdown has no editor equivalent yet. It is shown as a raw block and
always saved exactly as written:

- HTML blocks, such as `<details>`
- Link reference definitions (`[ref]: https://...`) and footnote text
  (`[^1]: ...`)
- Obsidian callouts (`> [!NOTE]`)
- Task lists that mix checklist items and plain items
- Lists or quotes containing any of the above

Small inline pieces are kept the same way: inline HTML such as `<kbd>`,
footnote references (`[^1]`) and reference links (`[text][ref]`).

## Links and tags

`[[Page]]`, `[[Page|shown text]]` and embeds such as `![[sketch.ink]]` are
kept as wiki links. An escaped `\[\[...]]` stays plain text. Tags such as
`#todo` are never escaped.
