# Figures

Figures lays images out in panels on a page of real size, ready for a paper or a poster. It is
made for microscopy: TIFFs straight from FIJI, rows and columns named by genotype, treatment or
antibody, scale bars, letters and arrows. Switch on **Figures** in Settings > Modules.

Each figure is a file, `<name>.figure.json`, beside your notes. The images are copied into an
`attachments` folder and never changed: crops, turns and brightness are applied when the figure
is drawn, so you can always go back.

## Making a figure

Open the Figures tool, give the figure a name, choose how many rows and columns, and press
**New figure**. A notebook's menu has New figure too.

- **Width:** single column (85 mm), one and a half (114 mm) or double column (174 mm), as most
  journals ask. Sizes on screen are true to the page.
- **Gap:** the space between panels, in mm.
- Add or remove rows and columns from the toolbar. Choose two panels next to each other (Shift
  and press) to join them into one; Split undoes it.

## Images

Drop images onto the page, paste them, or use **Add images**. Several at once fill the empty
panels in reading order; any more go in new rows at the bottom. On a tablet, Add images opens
the file manager (with Drive and OneDrive), so files keep their names. TIFF (8, 16 or 32-bit, with channels, as FIJI saves them), PNG and
JPEG all work.

Press a panel to choose it, then:

- drag inside it to move the image, and zoom with the buttons, the wheel or two fingers;
- turn a quarter or flip;
- **Match zoom** sets the other panels to the same zoom, so they share a scale.

## Brightness and contrast

Changes are always applied evenly, as journals expect. Choose whether they are set for the whole
figure, for each row, or for each column; every panel in that group is shown the same. For each
channel set its colour, where black starts and where it is full. The starting display runs from
zero to the brightest value in the group, so panels begin even.

## Labels

With nothing chosen, the side panel holds the figure's labels: rows at the left, columns at the
top, and headers over several columns. Type them plainly, with a little markup for genetics:

- `*w*` for _italics_, `**GFP**` for **bold**
- `^1118^` to raise (w¹¹¹⁸), `~2~` to lower (H₂O)

Panel letters (A, B, C or a, b, c) and channel names inside panels have their own corner, size
and colour. Everything is in Arial.

## Scale bars, marks and insets

- **Scale:** a TIFF from FIJI brings its pixel size with it; otherwise type it in µm per pixel.
  Then switch on the scale bar for a panel, and set its length, thickness, corner and colour.
- **Point things out:** arrows, arrowheads, asterisks and text, placed on the image. They stay
  pinned to the same spot when the image is moved or zoomed.
- **Zoomed inset:** draw a region on the image and a magnified copy appears in a corner of the
  panel, with the region outlined.

## Export

Choose a format and press **Export**. The file is saved beside the figure; an earlier export is
never overwritten.

- **PNG** or **TIFF** at 300 or 600 dpi, with the resolution written in, so it opens at its
  real size.
- **SVG**, with the text and shapes kept editable for Inkscape or Illustrator.
- **PDF**, with sharp text and shapes.

**Methods note** lists how each panel was made: its file, crop, turns, pixel size, scale bar and
the display range of each channel. Copy it, or save it as a page for the lab record.

## Not yet

- Graphs and other plots as panels
- Adjusting a single panel on its own (left out on purpose)
