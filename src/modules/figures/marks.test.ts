// @vitest-environment node
import { boxToImage, imageToBox } from './marks';
import { DEFAULT_CROP, type Crop } from './model';

const natural = { w: 2000, h: 1000 };
const box = { x: 10, y: 20, w: 50, h: 50 };

describe('image points and panel points', () => {
  it('finds an image point in the panel, and gives nothing outside the view', () => {
    // The square panel shows the middle half of the wide image.
    expect(imageToBox(0.5, 0.5, natural, box, DEFAULT_CROP)).toEqual({ x: 35, y: 45 });
    expect(imageToBox(0.25, 0.5, natural, box, DEFAULT_CROP)).toEqual({ x: 10, y: 45 });
    expect(imageToBox(0.1, 0.5, natural, box, DEFAULT_CROP)).toBeNull();
  });

  it('goes there and back, however the image is turned, flipped or zoomed', () => {
    const crops: Crop[] = [
      DEFAULT_CROP,
      { ...DEFAULT_CROP, turns: 1 },
      { ...DEFAULT_CROP, turns: 3, flip: true },
      { ...DEFAULT_CROP, zoom: 2.5, cx: 0.4, cy: 0.6 },
    ];
    for (const crop of crops) {
      const at = imageToBox(0.45, 0.55, natural, box, crop);
      if (!at) throw new Error(`Not in view for ${JSON.stringify(crop)}`);
      const back = boxToImage(at.x, at.y, natural, box, crop);
      expect(back.u).toBeCloseTo(0.45);
      expect(back.v).toBeCloseTo(0.55);
    }
  });

  it('turns a quarter clockwise: the image’s top edge goes to the right', () => {
    const square = { w: 1000, h: 1000 };
    const at = imageToBox(0.5, 0, square, box, { ...DEFAULT_CROP, turns: 1 });
    expect(at).toEqual({ x: 60, y: 45 });
  });
});
