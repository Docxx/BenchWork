import type { InkStroke } from './inkFile';
import { InkSurface, shownColour, type PenSettings } from './surface';

/** A canvas that draws nothing: the test browser has no real one. */
function stubCanvas() {
  const ctx = new Proxy(
    {},
    { get: (_t, name) => (name === 'canvas' ? undefined : () => undefined) },
  ) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
}

function pointer(
  type: string,
  pointerType: string,
  x: number,
  y: number,
  extra: { button?: number; buttons?: number; width?: number; id?: number } = {},
): PointerEvent {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: extra.button ?? 0,
    buttons: extra.buttons ?? 1,
  });
  Object.assign(e, {
    pointerType,
    pointerId: extra.id ?? 1,
    pressure: 0.7,
    width: extra.width ?? 1,
    height: extra.width ?? 1,
  });
  return e as PointerEvent;
}

const line = (id: string, y: number): InkStroke => ({
  id,
  tool: 'pen',
  colour: '#000000',
  width: 2,
  points: [
    [0, y, 0.5, 0],
    [100, y, 0.5, 10],
  ],
});

function setup(strokes: InkStroke[] = [], settings: Partial<PenSettings> = {}) {
  stubCanvas();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const changes: InkStroke[][] = [];
  const surface = new InkSurface(host, strokes, {
    settings: () => ({ tool: 'pen', colour: '#3a6fb0', width: 3, ...settings }),
    onChange: (s) => changes.push(s),
  });
  const send = (e: PointerEvent) => host.dispatchEvent(e);
  return { host, surface, changes, send };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the ink surface', () => {
  it('records a pen stroke with pressure, in the chosen colour', () => {
    const { send, changes } = setup();
    send(pointer('pointerdown', 'pen', 10, 10));
    send(pointer('pointermove', 'pen', 20, 15));
    send(pointer('pointerup', 'pen', 30, 20, { buttons: 0 }));
    expect(changes).toHaveLength(1);
    const [stroke] = changes[0] ?? [];
    expect(stroke).toMatchObject({ tool: 'pen', colour: '#3a6fb0', width: 3 });
    expect(stroke?.points.map(([x, y, p]) => [x, y, p])).toEqual([
      [10, 10, 0.7],
      [20, 15, 0.7],
      [30, 20, 0.7],
    ]);
  });

  it('lets fingers scroll, not write', () => {
    const { send, changes } = setup();
    send(pointer('pointerdown', 'touch', 10, 10));
    send(pointer('pointermove', 'touch', 10, 60));
    send(pointer('pointerup', 'touch', 10, 60));
    expect(changes).toHaveLength(0);
  });

  it('ignores a palm that lands while the pen is near', () => {
    const { send, changes } = setup();
    send(pointer('pointerdown', 'pen', 10, 10));
    send(pointer('pointerdown', 'touch', 50, 50, { id: 2, width: 80 }));
    send(pointer('pointerup', 'pen', 20, 10, { buttons: 0 }));
    expect(changes).toHaveLength(1);
  });

  it('erases whole strokes with the eraser tool, or the pen’s eraser end', () => {
    const { send, changes } = setup([line('a', 10), line('b', 50)], { tool: 'eraser' });
    send(pointer('pointerdown', 'mouse', 50, 11));
    send(pointer('pointerup', 'mouse', 50, 11, { buttons: 0 }));
    expect(changes.at(-1)?.map((s) => s.id)).toEqual(['b']);

    const pen = setup([line('a', 10), line('b', 50)]);
    pen.send(pointer('pointerdown', 'pen', 50, 50, { button: 5, buttons: 32 }));
    pen.send(pointer('pointerup', 'pen', 50, 50, { button: 5, buttons: 0 }));
    expect(pen.changes.at(-1)?.map((s) => s.id)).toEqual(['a']);
  });

  it('cannot be written on when read-only', () => {
    const { send, changes, surface } = setup();
    surface.setEditable(false);
    send(pointer('pointerdown', 'pen', 10, 10));
    send(pointer('pointerup', 'pen', 20, 10, { buttons: 0 }));
    expect(changes).toHaveLength(0);
  });
});

describe('ink colours', () => {
  it('show black ink light on a dark page, and keep other colours', () => {
    expect(shownColour('#000000', true)).not.toBe('#000000');
    expect(shownColour('#000000', false)).toBe('#000000');
    expect(shownColour('#ffffff', false)).not.toBe('#ffffff');
    expect(shownColour('#3a6fb0', true)).toBe('#3a6fb0');
  });
});
