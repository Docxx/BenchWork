import { expect, test, type Page } from '@playwright/test';
import { encodeTiff } from '../../src/modules/figures/tiffWrite';

/**
 * Figures: a new figure, two TIFFs from FIJI added as a grid, labels typed
 * in, a text part added, and the figure exported beside itself with a
 * methods note.
 */

/** A two-channel 16-bit TIFF as FIJI saves it, at 0.325 µm per pixel. */
function fijiTiff(seed: number): Buffer {
  const W = 120;
  const H = 90;
  const a = new Uint16Array(W * H);
  const b = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    a[i] = (i * seed) % 4000;
    b[i] = (i * 7) % 3000;
  }
  const bytes = encodeTiff(
    [
      { width: W, height: H, bits: 16, samples: 1, data: a },
      { width: W, height: H, bits: 16, samples: 1, data: b },
    ],
    {
      description: 'ImageJ=1.54f\nimages=2\nchannels=2\nunit=micron\n',
      resolution: { perUnit: 3.0769, unit: 2 },
    },
  );
  return Buffer.from(bytes);
}

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Lab', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { figures: { enabled: true } },
      }),
      'Lab/Notes.md': '# Notes\n',
    });
    memory.queuePick('C:/Lab');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
});

test('a figure is laid out from TIFFs, labelled and exported', async ({ page }) => {
  await page.locator('.nav-item', { hasText: 'Figures' }).click();
  await page.getByLabel('Figure name').fill('Fig 1');
  await page.getByRole('button', { name: 'New figure' }).click();

  await page.getByLabel('Images to add').setInputFiles([
    { name: 'control.tif', mimeType: 'image/tiff', buffer: fijiTiff(3) },
    { name: 'treated.tif', mimeType: 'image/tiff', buffer: fijiTiff(5) },
  ]);

  // Both images are copied in as a grid of two, with the pixel size read.
  await expect
    .poll(async () => {
      const text = await file(page, 'Lab/Fig 1.figure.json');
      if (text === null) return [];
      const f = JSON.parse(text) as {
        blocks: {
          grid?: { panels: { image: { path: string; umPerPx: number | null } | null }[] };
        }[];
      };
      return (f.blocks[0]?.grid?.panels ?? []).map((p) => [p.image?.path, p.image?.umPerPx]);
    })
    .toEqual([
      ['Lab/attachments/control.tif', 0.325],
      ['Lab/attachments/treated.tif', 0.325],
    ]);

  // Labels, in plain typed text with italics.
  await page.getByLabel('Row 1 label').fill('*w*^1118^');
  await page.getByLabel('Row 1 label').press('Enter');
  await expect.poll(async () => file(page, 'Lab/Fig 1.figure.json')).toContain('*w*^1118^');

  // A text part, lettered by nothing, under the grid.
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Text', { exact: true }).fill('Scale bars 20 µm');
  await page.getByLabel('Text size, points').click();
  await expect.poll(async () => file(page, 'Lab/Fig 1.figure.json')).toContain('Scale bars 20');

  // Exported as an SVG with its text kept, and as a PNG.
  await page.getByLabel('Export as').selectOption('svg');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fig 1.svg' })).toBeVisible();
  const svg = await file(page, 'Lab/Fig 1.svg');
  expect(svg).toContain('<tspan font-style="italic">w</tspan>');
  expect(svg).toContain('<image');
  expect(svg).toContain('>A</');
  expect(svg).toContain('Scale bars 20 µm');

  await page.getByLabel('Export as').selectOption('png');
  await page.getByLabel('Resolution').selectOption('600');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fig 1.png' })).toBeVisible();
  expect(await file(page, 'Lab/Fig 1.png')).toMatch(/^\[binary \d+ bytes\]$/);

  // The methods note, saved as a page beside the figure.
  await page.getByRole('button', { name: 'Methods note' }).click();
  await expect(page.getByLabel('Methods note text')).toHaveValue(/0\.325 µm per pixel/);
  await page.getByRole('button', { name: 'Save as a page' }).click();
  await expect
    .poll(async () => file(page, 'Lab/Fig 1 methods.md'))
    .toContain('`Lab/attachments/control.tif` (w1118)');
});
