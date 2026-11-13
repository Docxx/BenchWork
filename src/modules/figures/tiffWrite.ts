/**
 * Writing TIFFs: uncompressed, little-endian, one page per image, with an
 * optional description and resolution. Enough for an exported figure (an
 * 8-bit colour page at its dpi) and for ImageJ-style test files.
 */

export interface TiffPage {
  width: number;
  height: number;
  /** 8 or 16. */
  bits: 8 | 16;
  /** 1 for grey, 3 for RGB (samples side by side). */
  samples: 1 | 3;
  data: Uint8Array | Uint16Array;
}

export interface TiffOptions {
  description?: string;
  /** Pixels per inch (unit 2) or per centimetre (unit 3). */
  resolution?: { perUnit: number; unit: 2 | 3 };
}

const SHORT = 3,
  LONG = 4,
  RATIONAL = 5,
  ASCII = 2;

/** Writes the pages as one TIFF file. */
export function encodeTiff(pages: readonly TiffPage[], options: TiffOptions = {}): Uint8Array {
  const description =
    options.description === undefined ? null : new TextEncoder().encode(`${options.description}\0`);
  // Layout: header, then each page's pixel data, its extra values, and its directory.
  const parts: { offset: number; bytes: Uint8Array }[] = [];
  let at = 8;
  const put = (bytes: Uint8Array) => {
    if (at % 2 === 1) at += 1;
    const offset = at;
    parts.push({ offset, bytes });
    at += bytes.length;
    return offset;
  };
  const u16 = (values: number[]) => {
    const b = new Uint8Array(values.length * 2);
    const v = new DataView(b.buffer);
    values.forEach((x, i) => {
      v.setUint16(i * 2, x, true);
    });
    return b;
  };
  const u32 = (values: number[]) => {
    const b = new Uint8Array(values.length * 4);
    const v = new DataView(b.buffer);
    values.forEach((x, i) => {
      v.setUint32(i * 4, x, true);
    });
    return b;
  };
  const directories: number[] = [];
  const fixups: { at: number; value: () => number }[] = [];
  pages.forEach((page, index) => {
    const pixels =
      page.data instanceof Uint16Array
        ? new Uint8Array(page.data.buffer, page.data.byteOffset, page.data.byteLength)
        : page.data;
    const strip = put(pixels.slice());
    const bitsOffset = page.samples === 3 ? put(u16([page.bits, page.bits, page.bits])) : 0;
    const descOffset = description && index === 0 ? put(description) : 0;
    const res = options.resolution;
    const resOffset = res ? put(u32([Math.round(res.perUnit * 10000), 10000])) : 0;
    type Entry = readonly [tag: number, type: number, count: number, value: number];
    const entries: Entry[] = [
      [256, LONG, 1, page.width],
      [257, LONG, 1, page.height],
      [258, SHORT, page.samples, page.samples === 3 ? bitsOffset : page.bits],
      [259, SHORT, 1, 1],
      [262, SHORT, 1, page.samples === 3 ? 2 : 1],
      ...(descOffset && description
        ? ([[270, ASCII, description.length, descOffset]] as const)
        : []),
      [273, LONG, 1, strip],
      [277, SHORT, 1, page.samples],
      [278, LONG, 1, page.height],
      [279, LONG, 1, pixels.length],
      ...(res
        ? ([
            [282, RATIONAL, 1, resOffset],
            [283, RATIONAL, 1, resOffset],
          ] as Entry[])
        : []),
      [284, SHORT, 1, 1],
      ...(res ? ([[296, SHORT, 1, res.unit]] as const) : []),
    ];
    const ifd = new Uint8Array(2 + entries.length * 12 + 4);
    const v = new DataView(ifd.buffer);
    v.setUint16(0, entries.length, true);
    entries.forEach(([tag, type, count, value], i) => {
      const o = 2 + i * 12;
      v.setUint16(o, tag, true);
      v.setUint16(o + 2, type, true);
      v.setUint32(o + 4, count, true);
      // A single short sits in the first two bytes of the value field.
      if (type === SHORT && count === 1) v.setUint16(o + 8, value, true);
      else v.setUint32(o + 8, value, true);
    });
    const offset = put(ifd);
    directories.push(offset);
    if (index > 0) {
      const previous = directories[index - 1] ?? 0;
      const previousEntries = parts.find((p) => p.offset === previous)?.bytes;
      if (previousEntries) {
        fixups.push({
          at: previous + previousEntries.length - 4,
          value: () => offset,
        });
      }
    }
  });
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  out.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, directories[0] ?? 0, true);
  for (const p of parts) out.set(p.bytes, p.offset);
  for (const f of fixups) view.setUint32(f.at, f.value(), true);
  return out;
}
