import { cleanSvg, fitIn, nestedSvg, NO_TRIM, parseGraphic, shownRect } from './graphic';

const n = (v: number) => String(Math.round(v * 1000) / 1000);

const PRISM = `<svg xmlns="http://www.w3.org/2000/svg" width="300pt" height="200pt" viewBox="0 0 300 200">
<script>alert(1)</script><foreignObject><p>x</p></foreignObject>
<defs><clipPath id="c1"><rect width="10" height="10"/></clipPath></defs>
<g clip-path="url(#c1)"><rect x="10" y="10" width="40" height="100" onclick="alert(2)"/></g>
<use href="#c1"/><use href="https://example.org/x.svg#a"/><a href="https://example.org">x</a>
<text x="20" y="190">WT</text></svg>`;

describe('graphs from elsewhere', () => {
  it('takes out scripts and anything that is not drawing, and keeps the drawing', () => {
    const svg = cleanSvg(PRISM);
    expect(svg).not.toBeNull();
    const markup = svg?.markup ?? '';
    expect(markup).not.toMatch(/script|alert|foreignObject|onclick|example\.org/);
    // Shapes reused from within the drawing are kept.
    expect(markup).toContain('<use href="#c1"');
    expect(markup).toContain('>WT</text>');
    expect(svg?.viewBox).toEqual([0, 0, 300, 200]);
    // Drawn large, in the graph's shape.
    expect((svg?.w ?? 0) / (svg?.h ?? 1)).toBeCloseTo(1.5);
    expect(Math.max(svg?.w ?? 0, svg?.h ?? 0)).toBe(4000);
  });

  it('measures an SVG with a size but no view box, and turns away what is not an SVG', () => {
    const svg = cleanSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm"></svg>',
    );
    expect(svg?.viewBox[2]).toBeCloseTo((80 * 96) / 25.4);
    expect(cleanSvg('<html><body>no</body></html>')).toBeNull();
    expect(cleanSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
  });

  it('trims edges and fits what is left in a box, its shape kept', () => {
    const shown = shownRect({ w: 200, h: 100 }, { left: 0.1, top: 0, right: 0.1, bottom: 0.5 });
    expect(shown).toEqual({ x: 20, y: 0, w: 160, h: 50 });
    expect(fitIn({ w: 200, h: 100 }, { x: 0, y: 0, w: 100, h: 100 })).toEqual({
      x: 0,
      y: 25,
      w: 100,
      h: 50,
    });
  });

  it('nests an SVG at its place in mm, showing the trimmed part, with ids of its own', () => {
    const svg = cleanSvg(PRISM);
    if (!svg) throw new Error('not read');
    const out = nestedSvg(svg, { x: 10, y: 20, w: 60, h: 40 }, { ...NO_TRIM, left: 0.1 }, n, 'g2-');
    expect(out).toMatch(/^<svg x="10" y="20" width="60" height="40" viewBox="30 0 270 200"/);
    expect(out).toContain('id="g2-c1"');
    expect(out).toContain('url(#g2-c1)');
    expect(out).toContain('href="#g2-c1"');
    expect(out.match(/<svg/g)).toHaveLength(1);
  });

  it('reads back a graph, keeping trims within bounds', () => {
    expect(parseGraphic({ path: 'a.svg', page: 0, trim: { left: 0.9, top: -1 } })).toEqual({
      path: 'a.svg',
      page: 1,
      trim: { left: 0.45, top: 0, right: 0, bottom: 0 },
    });
    expect(parseGraphic({ page: 2 })).toBeNull();
  });
});
