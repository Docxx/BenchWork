import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test for the Phase 1 ink spike page. Real pen feel can only be
 * judged on the tablet; this checks that strokes are recorded and that
 * palm rejection runs.
 */

interface Move {
  pointerType: 'pen' | 'touch';
  pointerId: number;
  points: [number, number][];
  /** Contact size in px; fingers are about 10, palms much bigger. */
  size?: number;
}

/** Sends one pointer down, moves and up to the ink area as synthetic events. */
async function stroke(page: Page, move: Move) {
  await page.evaluate((m) => {
    const area = document.querySelector('.ink-area');
    if (!area) throw new Error('No ink area');
    const rect = area.getBoundingClientRect();
    const size = m.size ?? 1;
    const send = (type: string, [x, y]: [number, number], pressure: number) => {
      area.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: m.pointerType,
          pointerId: m.pointerId,
          isPrimary: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          pressure,
          width: size,
          height: size,
        }),
      );
    };
    const [first, ...rest] = m.points;
    if (!first) return;
    send('pointerdown', first, 0.4);
    for (const p of rest) send('pointermove', p, 0.7);
    send('pointerup', rest.at(-1) ?? first, 0);
  }, move);
}

const strokeCount = (page: Page) => page.getByTestId('stroke-count');
const rejection = (page: Page) => page.getByTestId('last-rejection');

test.beforeEach(async ({ page }) => {
  await page.goto('/spikes/ink/');
  await expect(strokeCount(page)).toHaveText('0');
});

test('a pen stroke is recorded', async ({ page }) => {
  await stroke(page, {
    pointerType: 'pen',
    pointerId: 2,
    points: [
      [40, 40],
      [60, 50],
      [80, 70],
      [120, 90],
    ],
  });
  await expect(strokeCount(page)).toHaveText('1');
  const report = await page.evaluate(
    () => window.__inkSpike?.report() as { status: { lastPointer: { type: string } } },
  );
  expect(report.status.lastPointer.type).toBe('pen');
});

test('fingers do not draw, and touches near the pen are ignored', async ({ page }) => {
  await stroke(page, {
    pointerType: 'touch',
    pointerId: 3,
    size: 10,
    points: [
      [40, 300],
      [40, 250],
    ],
  });
  await expect(strokeCount(page)).toHaveText('0');

  await stroke(page, {
    pointerType: 'pen',
    pointerId: 2,
    points: [
      [40, 40],
      [90, 60],
    ],
  });
  await stroke(page, {
    pointerType: 'touch',
    pointerId: 4,
    size: 10,
    points: [
      [200, 200],
      [220, 220],
    ],
  });
  await expect(strokeCount(page)).toHaveText('1');
  await expect(rejection(page)).toHaveText('Ignored a touch near the pen');
});

test('a palm-sized touch is ignored', async ({ page }) => {
  await stroke(page, {
    pointerType: 'touch',
    pointerId: 5,
    size: 120,
    points: [
      [100, 100],
      [110, 110],
    ],
  });
  await expect(rejection(page)).toHaveText('Ignored a large touch (120 px)');
  await expect(strokeCount(page)).toHaveText('0');
});
