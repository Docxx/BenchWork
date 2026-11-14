# Figures

Figures puts the parts of a figure on a page of real size: images, grids of images, blots,
graphs, text and lines, lettered A, B, C and labelled the way journals expect. Switch on
**Figures** in Settings > Modules.

Each figure is a file, `<name>.figure.json`, beside your notes. Images and graphs are copied into
an `attachments` folder and never changed: crops, turns and brightness are applied when the
figure is drawn, so you can always go back.

## Making a figure

Open the Figures tool, give the figure a name and press **New figure**. A notebook's menu has New
figure too. The page starts empty; choose its width beside it with nothing chosen:

- **Width:** single column (85 mm), one and a half (114 mm) or double column (174 mm), as most
  journals ask. Sizes on screen are true to the page.
- **Space between parts:** the gap parts snap to when they sit side by side.

Add parts from the toolbar: **Images**, **Grid**, **Graph**, **Text**, **Table** and **Line**. You
can also drop files straight onto the page.

## Moving and sizing parts

- Press a part to choose it, and drag to move it. It snaps to the page edges, to other parts'
  edges and middles, and to the gap beside them; a pink line shows each catch.
- Drag the squares round a chosen part to resize it. For an image, a corner keeps its shape and
  an edge crops it.
- Drag the round handle above a chosen part to move it, even when an image fills it.
- The arrow keys nudge a chosen part (with Shift, further). Delete removes it.
- Beside a chosen part: its exact place and size, duplicate, bring to front or send to back.

Figures exported start at the top part, so space above it is left out.

## Letters

Images, grids and graphs are lettered in reading order: across each row of the page, then down.
Change the style (A, a or (a)) and size with nothing chosen. Give a part **Its own** letter, such
as A′, or **None**. Text, tables and lines have no letter unless you give one.

## Images and grids

Drop one image on the page and it becomes a part of its own, shaped like the image. Drop several
and they become a grid. **Grid** adds an empty grid to fill: drop images onto its panels, or
choose it and press **Add images**. Images fill empty panels in reading order; any more go in new
rows. On a tablet, Add images opens the file manager (with Drive and OneDrive), so files keep
their names. TIFF (8, 16 or 32-bit, with channels, as FIJI saves them), PNG and JPEG all work.

Once a part is chosen, press an image in it to work on that image:

- drag inside it to move the image in its frame, and zoom with the buttons, the wheel or two
  fingers;
- turn a quarter or flip;
- **Match zoom** sets the other chosen images to the same zoom, so they share a scale.

### Labels round a grid

Choose a grid (press the space round its images, or **The whole grid**) for its labels. Type them
plainly, with a little markup for genetics:

- `*w*` for _italics_, `**GFP**` for **bold**
- `^1118^` to raise (w¹¹¹⁸), `~2~` to lower (H₂O)

There are labels for each row at the left, each column at the top, **headers** over several
columns with a line under them, and **side labels** beside groups of rows with a line along them,
on the left or the right.

### Scale bars, marks and insets

- **Scale:** a TIFF from FIJI brings its pixel size with it; otherwise type it in µm per pixel.
  Then switch on the scale bar for an image, and set its length, thickness, corner and colour.
- **Point things out:** arrows, arrowheads, asterisks and text, placed on the image. They stay
  pinned to the same spot when the image is moved or zoomed.
- **Zoomed inset:** draw a region on the image and a magnified copy appears in a corner, with the
  region outlined.
- **Channel names** in a corner of each image, in their colours.

### Brightness

**Adjust brightness**, under an image, sets each channel's colour, where black starts and where it
is full. Changes are always applied evenly, as journals expect: to the whole grid, each row or
each column. Most figures never need it.

## Blots

Choose an image and press **Label as a blot** for labels round it:

- **Lanes:** how many, and where they start and end across the image.
- **Lane names** above each lane (type them with commas), read across, slanted or upright.
- **Groups** over several lanes, with a line under each, such as Control and MSU.
- **Conditions** above the lanes: a name, then + or − for each lane. Press a value to switch
  between +, − and empty, or type values with commas.
- **Size markers** down the left, such as 62 kDa, and **band names** down the right. Drag them up
  and down beside the image to line them up with the bands.

## Graphs

### From data

**Graph** adds a graph drawn from data. Paste data straight from a spreadsheet into its box, or
press **Read a spreadsheet** for a CSV or Excel file. Two layouts work:

- **Groups across, values down:** each column is a group, with its replicates below its name.
- **Several series:** leave the first cell empty, put each series name across the top (repeated
  once for each replicate), and start each row with a group's name.

Then choose:

- **Kind:** bars, lines through the means, or points with the mean marked.
- **Error bars:** SEM, SD or none. **Show each value** puts a dot for each replicate.
- **Axes:** names (with italics and powers, such as `*γ*H~2~AX`), fixed ends, or powers of ten.
  Numbers along the bottom of a line or point graph are placed by value.
- **Colours** that stay apart for colour-blind readers, and a **key** above, at the right or inside.
- **Significance:** brackets between two bars or groups, with stars, ns or a P value typed in.
  Wider brackets stack above narrower ones. The stars are not worked out for you: run your
  statistics first.

### From another program

Graphs from Prism, Excel or R can be added as they are. Save them as **SVG** to keep them sharp
and editable, or as PDF; drop the file on the page or use **Images**. Trim each edge to cut away
margins, then **Fit the part to the graph**. In an SVG export an SVG graph stays as shapes and
text; elsewhere graphs are drawn at 600 dpi or more.

## Text, tables and lines

- **Text:** a label anywhere, with the same markup. It can read upwards, as a side label.
- **Table:** rows of + and − (or doses) under a graph, its columns spread evenly across its width.
  Line it up under the bars it describes.
- **Line:** a line, arrow, bracket or box, across, down or slanting, solid or dashed. A bracket's
  ends turn down (or up), for joining things or marking significance anywhere.

## Export

Choose a format and press **Export**. The file is saved beside the figure; an earlier export is
never overwritten.

- **PNG** or **TIFF** at 300 or 600 dpi, with the resolution written in, so it opens at its real
  size.
- **SVG**, with the text and shapes kept editable for Inkscape or Illustrator.
- **PDF**, with sharp text and shapes.

Everything is in Arial. **Methods note** lists how each image was made (its file, crop, turns,
pixel size, scale bar and the display range of each channel) and which file each graph came from.
Copy it, or save it as a page for the lab record.

## Figures made before

A figure made before parts came in opens as one grid filling the page, looking as it did, with its
letters still in its panels. Once it is saved, older versions of BenchWork cannot open it.

## Not yet

- Statistics worked out for you
- Adjusting a single image on its own (left out on purpose)

## Saving and workspace

The note side panel is hidden while a figure is open, giving the canvas more room. Its previous
visibility returns when you leave Figures.

Edits save automatically. If a write fails, your changes stay open with **Retry save**.
Navigation, closing the vault and installing an update wait for the figure to save successfully.
