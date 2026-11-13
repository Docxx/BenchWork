import { displayGroup, START_COLOURS, type ChannelShow, type Figure, type Panel } from './model';
import { composite, decodeTiff, type Planes } from './tiff';

const TIFF = /\.tiff?$/i;

/** Reads any image a figure can show as channels of values: a TIFF, or a PNG, JPEG and the like. */
export async function loadPlanes(bytes: Uint8Array, path: string): Promise<Planes> {
  if (TIFF.test(path)) return decodeTiff(bytes);
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) throw new Error('This image could not be drawn.');
    c.drawImage(bitmap, 0, 0);
    const { data } = c.getImageData(0, 0, bitmap.width, bitmap.height);
    const n = bitmap.width * bitmap.height;
    const channels = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const plane = channels[k];
        if (plane) plane[i] = data[i * 4 + k] ?? 0;
      }
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      bits: 8,
      channels,
      rgb: true,
      umPerPx: null,
      peaks: [255, 255, 255],
    };
  } finally {
    bitmap.close();
  }
}

/** The highest possible value for a bit depth. */
const full = (bits: number) => (bits === 8 ? 255 : bits === 16 ? 65535 : 1);

/**
 * How each channel of a panel's image is shown: its group's settings if set;
 * otherwise from zero to the highest value of that channel in any image of
 * the same depth in the figure, so every panel starts alike.
 */
export function showsFor(
  figure: Figure,
  panel: Panel,
  planes: Planes,
  all: ReadonlyMap<string, Planes>,
): ChannelShow[] {
  const set = figure.display.groups[displayGroup(figure.display, panel)];
  return planes.channels.map((_c, i) => {
    const given = set?.[i];
    if (given) return given;
    if (planes.rgb && planes.bits === 8) return { min: 0, max: 255, colour: '#ffffff', on: true };
    let peak = 0;
    for (const p of all.values()) {
      if (p.bits === planes.bits && p.rgb === planes.rgb) peak = Math.max(peak, p.peaks[i] ?? 0);
    }
    return {
      min: 0,
      max: peak > 0 ? peak : full(planes.bits),
      colour: planes.channels.length === 1 ? '#ffffff' : (START_COLOURS[i] ?? '#ffffff'),
      on: true,
    };
  });
}

/** The image drawn with its channels shown as set, as a canvas ready to place. */
export function picture(planes: Planes, shows: readonly ChannelShow[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = planes.width;
  canvas.height = planes.height;
  canvas.getContext('2d')?.putImageData(composite(planes, shows), 0, 0);
  return canvas;
}

/** The highest value a channel's range can be set to. */
export const rangeTop = (planes: Planes) => full(planes.bits);
