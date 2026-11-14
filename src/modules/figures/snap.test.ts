import { keepShape, resized, snapMove, snapResize } from './snap';

const o = { pageWidth: 174, gap: 3, reach: 2 };

describe('snapping', () => {
  it('catches an edge near the page edge', () => {
    const out = snapMove({ x: 1.5, y: 30, w: 50, h: 20 }, [], o);
    expect(out.box.x).toBe(0);
    expect(out.guides).toContainEqual({ axis: 'x', at: 0 });
    const right = snapMove({ x: 122.8, y: 30, w: 50, h: 20 }, [], o);
    expect(right.box.x + right.box.w).toBe(174);
  });

  it('keeps the figure gap beside another part, and lines up tops', () => {
    const other = { x: 0, y: 10, w: 80, h: 40 };
    const out = snapMove({ x: 84.2, y: 11, w: 50, h: 30 }, [other], o);
    expect(out.box.x).toBe(83);
    expect(out.box.y).toBe(10);
  });

  it('leaves a box alone when nothing is near', () => {
    const box = { x: 40, y: 70, w: 30, h: 20 };
    expect(snapMove(box, [{ x: 0, y: 0, w: 10, h: 10 }], o).box).toEqual(box);
  });

  it('snaps only the edges being dragged', () => {
    const out = snapResize({ x: 10, y: 10, w: 162.5, h: 30 }, { right: true }, [], o);
    expect(out.box).toEqual({ x: 10, y: 10, w: 164, h: 30 });
  });
});

describe('resizing', () => {
  it('moves the edges dragged and keeps a smallest size', () => {
    const start = { x: 10, y: 10, w: 40, h: 30 };
    expect(resized(start, { left: true, top: true }, 5, -5)).toEqual({ x: 15, y: 5, w: 35, h: 35 });
    expect(resized(start, { right: true }, -100, 0).w).toBe(4);
  });

  it('keeps an image its shape from a corner, but not from an edge', () => {
    const start = { x: 0, y: 0, w: 40, h: 20 };
    const corner = keepShape(start, { x: 0, y: 0, w: 80, h: 25 }, { right: true, bottom: true });
    expect(corner.h).toBe(40);
    const top = keepShape(start, { x: 0, y: 0, w: 20, h: 25 }, { left: true, top: true });
    expect(top).toEqual({ x: 0, y: 10, w: 20, h: 10 });
    const edge = { x: 0, y: 0, w: 80, h: 20 };
    expect(keepShape(start, edge, { right: true })).toEqual(edge);
  });
});
