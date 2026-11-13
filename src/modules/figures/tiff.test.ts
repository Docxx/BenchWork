// @vitest-environment node
import { decodeTiff, micronsPerPixel, parseImageJ } from './tiff';
import { encodeTiff } from './tiffWrite';

describe('ImageJ details', () => {
  it('reads channels and unit from the description', () => {
    expect(parseImageJ('ImageJ=1.54f\nimages=6\nchannels=3\nslices=2\nunit=micron\n')).toEqual({
      channels: 3,
      slices: 2,
      frames: 1,
      unit: 'micron',
    });
    expect(parseImageJ('Made by a scanner')).toBeNull();
  });

  it('turns a resolution into micrometres per pixel', () => {
    expect(micronsPerPixel(4, 'micron')).toBe(0.25);
    expect(micronsPerPixel(2, 'nm')).toBe(0.0005);
    expect(micronsPerPixel(4, null)).toBeNull();
    expect(micronsPerPixel(0, 'micron')).toBeNull();
  });
});

describe('reading TIFFs', () => {
  it('reads a two-channel 16-bit ImageJ stack, its pixel size and peaks', async () => {
    const plane = (seed: number) => Uint16Array.from({ length: 12 }, (_v, i) => i * seed);
    const bytes = encodeTiff(
      [
        { width: 4, height: 3, bits: 16, samples: 1, data: plane(100) },
        { width: 4, height: 3, bits: 16, samples: 1, data: plane(300) },
      ],
      {
        description: 'ImageJ=1.54f\nimages=2\nchannels=2\nunit=micron\n',
        resolution: { perUnit: 3.0769, unit: 2 },
      },
    );
    const planes = await decodeTiff(bytes);
    expect([planes.width, planes.height, planes.bits, planes.rgb]).toEqual([4, 3, 16, false]);
    expect(planes.channels).toHaveLength(2);
    expect(Array.from(planes.channels[1] ?? []).slice(0, 3)).toEqual([0, 300, 600]);
    expect(planes.peaks).toEqual([1100, 3300]);
    expect(planes.umPerPx).toBeCloseTo(0.325, 3);
  });

  it('reads an 8-bit colour TIFF as red, green and blue', async () => {
    const rgb = Uint8Array.from({ length: 2 * 2 * 3 }, (_v, i) => (i % 3 === 1 ? 200 : 10));
    const planes = await decodeTiff(
      encodeTiff([{ width: 2, height: 2, bits: 8, samples: 3, data: rgb }]),
    );
    expect(planes.rgb).toBe(true);
    expect(planes.channels).toHaveLength(3);
    expect(planes.peaks).toEqual([10, 200, 10]);
    expect(planes.umPerPx).toBeNull();
  });
});
