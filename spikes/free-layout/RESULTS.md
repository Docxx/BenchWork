# Free layout spike: method and results

Question: can BenchWork offer free-layout pages, with text anywhere on the
page and cut and paste working across it, using the page editor it already
has? The answer decides how Free pages are built. This page is a test bench,
not app code; nothing here ships.

**Status:** round 2, after Ray's first hands-on try (see below).
**Provisional go:** one editor per page, with boxes as positioned blocks.

## The approach

A Free page is still one ProseMirror document, on the same Yjs set-up as
pages. Its top level is a list of **boxes**, each with `x`, `y` and a width;
inside a box are the usual blocks (headings, lists, tables, and so on).
Boxes are drawn absolutely positioned. Because it is one document, cut,
copy, paste, selection across boxes and undo all come from the editor
itself.

Boxes are kept in **reading order** (top to bottom, then left to right) in
the document, so arrow keys, screen readers and the saved Markdown all
follow the page as it reads.

Saved as Markdown, each box's text follows a hidden comment giving its
place, so other Markdown apps show the page as a
document in reading order:

```markdown
<!-- box x=40 y=120 w=420 -->

Notes from the meeting...
```

## Running it

```powershell
pnpm dev
```

Open <http://127.0.0.1:1420/spikes/free-layout/>. The panel on the right
lists what to try and shows the page as it would be saved; edit that
Markdown and press **Load this Markdown** to read it back.

## What was tested

In the browser pane (Chromium), and in tests (`box.test.ts`,
`storage.test.ts`):

| Check                                            | Result                                       |
| ------------------------------------------------ | -------------------------------------------- |
| Click empty space and type: a box appears there  | Works                                        |
| Move a box by its top bar                        | Works; saved as one undoable step            |
| Resize a box's width by its right edge           | Works                                        |
| Moving past another box changes reading order    | Works; the cursor stays where it was         |
| Select across two boxes and cut                  | Works after a fix (below)                    |
| Paste into empty space                           | Works: a box at the click holds the paste    |
| Paste copied boxes                               | Works after a fix: their text, at the cursor |
| Typing or Delete over a selection across boxes   | Works after a fix                            |
| Ctrl+Z after typing, cutting, pasting and moving | Works after a fix                            |
| Arrow keys at the end of a box                   | Go on to the next box in reading order       |
| An empty box goes when the cursor leaves it      | Works                                        |
| Switch to Document and back                      | No text lost; Document follows reading order |
| Markdown round trip                              | Exact, in tests                              |

### Problems found, and fixed

1. **Cutting across boxes joined them.** The editor's own delete joined
   what was left of the first and last boxes into one. Fixed with a delete
   that works box by box: each keeps what was outside the selection and
   stays put; boxes wholly selected go. It is used for cut, Delete,
   Backspace and typing over such a selection.
2. **Pasting copied boxes made overlapping copies** at the old places.
   Fixed: pasted boxes give up their text, which goes where the cursor is.
3. **Ctrl+Z did nothing after moving a box**, as dragging the top bar took
   the keyboard away from the text. Fixed by giving it back after a move.

## Still to try by hand

These need a real mouse, keyboard and clipboard, which the browser pane
cannot fully fake:

- Real Ctrl+X / Ctrl+C / Ctrl+V between boxes, and from Word or a web page
  into empty space.
- Dragging selected text out of a box onto empty space (the code is there;
  dragging is not testable from the pane).
- Selecting across boxes with the mouse, and Shift+arrow keys.
- In the desktop app (WebView2): `pnpm tauri dev`, F12, then
  `location.href = '/spikes/free-layout/'`.
- On a touch screen: the top bar shows when a box has the cursor, as there
  is no hover.

## Decision

Provisional **go** for one editor per page, pending the checks above. The
fall-back, one small editor per box, would lose selecting across boxes and
undo across the page, so it is only worth it if the hand checks find
something the single editor cannot do.

## Round 2: Ray's first try

Ray's findings, and what changed:

| Found                                             | Cause                                     | Now                                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copying and pasting images did not work           | The spike's editor had no images at all   | Paste a screenshot or image at the cursor; drop an image file on empty page for a new box, or on a box to put it there                                                                                                         |
| Dragging made a new box instead of selecting      | Pressing on empty page made a box at once | A click makes a box; a drag draws a rectangle and selects the boxes it touches. Dragging selected text out still moves it                                                                                                      |
| Boxes could not be made taller                    | Only the width could change               | Bottom edge and corner change the height; the page grows below its lowest box and scrolls while dragging near its edges                                                                                                        |
| No toolbar for bold, italics, highlight and so on | Not built yet                             | A ribbon with Home (undo, text style, bold, italic, underline, strikethrough, highlight, code, lists, quote, box colour) and Insert (text box, sticky note, table, picture, link, to-do list, code block, divider, date, time) |

Sticky notes are boxes with a colour (yellow, pink, green, blue or purple),
kept even when empty. Any box can be given a colour from Home.

Checked in the browser pane and in a real Chromium drag (Playwright):
images by paste and drop, the selection rectangle, height, page growth,
sticky notes, formatting, and dragging selected text out of a box.
Scrolling while dragging a box needs a real mouse to check.

**Fonts per word:** not offered. Pages are Markdown, which has no way to
record a font or size for some words, so they would be lost on saving and
in other apps. The page font and text size are set in Settings > Appearance.

**Highlight and underline** show in the spike but are not yet in its
saved Markdown. The app will save them as `==highlight==` (as other
Markdown note apps do) and `<u>underline</u>`.

## Round 3

- Switching to Document and back no longer merges every box into one.
  Document view shows the same boxes one after another in reading order,
  with the free layout's clicks, drags and drops off; switching back puts
  each box where it was. Text typed in Document view stays in its box.
- The layout switch reads **Free layout** and **Document**. Ray asked for
  no other products to be named in what people see.

## What the real build adds

- `layout: free` in a page's properties, a toggle in the top bar, and the
  default for new pages in Settings.
- Images and files dropped or pasted onto empty space, as boxes.
- The box format in the page saver and loader, with the existing
  round-trip tests extended.
- Touch: a visible top bar on tablets, and ink anywhere on the page in
  Phase 4.
