import { toSvg, withResolution } from './exportFigure';
import { methodsNote } from './methods';
import { parseDoc, type FigureDoc } from './doc';
import { newGrid } from './model';
import { buildScene } from './scene';
import type { Planes } from './tiff';

/** A labelled two-panel figure, with one image in the first panel, saved before parts. */
function sample(): FigureDoc {
  const f = newGrid(1, 2, 85);
  const [a, b] = f.panels;
  if (!a || !b) throw new Error('no panels');
  const doc = parseDoc(
    JSON.stringify({
      ...f,
      rowLabels: ['*w*^1118^'],
      colLabels: ['Control', 'H~2~O & <salt>'],
      panels: [
        {
          ...a,
          scaleBar: true,
          image: {
            path: 'Lab/attachments/control.tif',
            crop: { zoom: 2, cx: 0.5, cy: 0.5, turns: 1, flip: false },
            umPerPx: 0.325,
          },
        },
        b,
      ],
    }),
  );
  if (!doc) throw new Error('not read');
  return doc;
}

const planes: Planes = {
  width: 600,
  height: 450,
  bits: 16,
  rgb: false,
  channels: [new Uint16Array(600 * 450).fill(1000), new Uint16Array(600 * 450).fill(3000)],
  umPerPx: 0.325,
  peaks: [1000, 3000],
};

describe('the scene', () => {
  it('leaves out the editing hints when exporting', () => {
    const f = sample();
    const editing = buildScene(f, { sources: new Map(), editing: true });
    const exporting = buildScene(f, { sources: new Map(), editing: false });
    expect(exporting.prims.length).toBeLessThan(editing.prims.length);
    expect(exporting.width).toBe(85);
    expect(exporting.height).toBeCloseTo(editing.height);
  });

  it('turns row labels to read upwards', () => {
    const scene = buildScene(sample(), { sources: new Map(), editing: false });
    const row = scene.prims.find((p) => p.kind === 'text' && p.runs.some((r) => r.text === '1118'));
    expect(row?.kind === 'text' && row.rotate).toBe(90);
  });
});

describe('exports', () => {
  it('writes the resolution into a PNG after its header', () => {
    // A PNG signature and an IHDR chunk are all that is checked.
    const png = new Uint8Array(8 + 25 + 12);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const out = withResolution(png, 300);
    expect(out.length).toBe(png.length + 21);
    expect(new TextDecoder().decode(out.subarray(37, 41))).toBe('pHYs');
    const v = new DataView(out.buffer);
    expect(v.getUint32(41)).toBe(11811);
    expect(v.getUint32(45)).toBe(11811);
    expect(out[49]).toBe(1);
    // The chunk's CRC, as any PNG reader checks it.
    expect(v.getUint32(50)).toBe(0x78a53f76);
  });

  it('keeps text as text in an SVG, in mm, with styles and safe characters', async () => {
    const scene = buildScene(sample(), { sources: new Map(), editing: false });
    const svg = await toSvg(scene);
    expect(svg).toContain('width="85mm"');
    expect(svg).toContain('<tspan font-style="italic">w</tspan>');
    expect(svg).toMatch(/<tspan font-size="[\d.]+" baseline-shift="[\d.]+">1118<\/tspan>/);
    expect(svg).toContain('&amp; &lt;salt&gt;');
    expect(svg).toContain('rotate(-90');
    expect(svg).not.toContain('<image');
  });
});

describe('the methods note', () => {
  it('lists each panel with its file, crop, scale and display', () => {
    const note = methodsNote(sample(), new Map([['Lab/attachments/control.tif', planes]]), 'Fig 1');
    expect(note).toContain('# Fig 1: how it was made');
    expect(note).toContain('1 row by 2 columns');
    expect(note).toContain('**A**: `Lab/attachments/control.tif` (w1118, Control)');
    expect(note).toContain('600 × 450 px, 16-bit');
    expect(note).toContain('cropped to 50%');
    expect(note).toContain('turned 90° clockwise');
    expect(note).toContain('0.325 µm per pixel; scale bar');
    expect(note).toMatch(/channel 1 \(green\) 0 to \d+; channel 2 \(magenta\) 0 to \d+/);
    // The empty panel is left out.
    expect(note).not.toContain('**B**');
  });
});
