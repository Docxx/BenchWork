import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/** Opens a vault with References on, then the Zotero references page. */
async function openLibrary(page: Page, files: Record<string, string>) {
  await page.goto('/');
  await page.evaluate((files) => {
    const vault = window.__benchworkMemory;
    if (!vault) throw new Error('Missing vault');
    vault.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { references: { enabled: true } },
      }),
      ...files,
    });
    vault.queuePick('C:/Vault');
  }, files);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Reading and writing', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Reading and writing' })
    .getByRole('button', { name: 'Zotero references' })
    .click();
  return page.locator('.zotero-browser');
}

test('browses a Zotero library by collection and tag, sorts it, and shows details', async ({
  page,
}) => {
  const copy = {
    source: 'zotero',
    userId: '42',
    version: 3,
    synced: '2026-11-27T10:00:00.000Z',
    collections: [
      { key: 'TH', name: 'Thesis', parent: null },
      { key: 'C2', name: 'Chapter 2 AMPs', parent: 'TH' },
    ],
    items: [
      {
        id: 'Buchon2014-rs',
        title: 'Immunity in Drosophila melanogaster',
        author: [
          { family: 'Buchon', given: 'Nicolas' },
          { family: 'Silverman', given: 'Neal' },
          { family: 'Cherry', given: 'Sara' },
        ],
        issued: { 'date-parts': [[2014]] },
        'container-title': 'Nature Reviews Immunology',
        DOI: '10.1038/nri3763',
        abstract: 'Much of our knowledge of innate immunity comes from the fruit fly.',
        'zotero-collections': ['C2'],
        'zotero-tags': ['review'],
        'zotero-added': '2025-01-01T00:00:00Z',
      },
      {
        id: 'Kounatidis2017-ab',
        title: 'NF-kB immunity in the brain determines fly lifespan',
        author: [{ family: 'Kounatidis', given: 'Ilias' }],
        issued: { 'date-parts': [[2017]] },
        'container-title': 'Cell Reports',
        'zotero-collections': ['TH'],
        'zotero-added': '2026-01-01T00:00:00Z',
      },
      {
        id: 'Loose2010-ef',
        title: 'A paper in no collection',
        issued: { 'date-parts': [[2010]] },
      },
    ],
  };
  const library = await openLibrary(page, {
    'references/zotero-library.json': JSON.stringify(copy),
    '.benchwork/modules/references/settings.json': JSON.stringify({
      libraryPath: 'references/library.json',
      zotero: true,
    }),
  });
  const rows = library.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4);
  // Newest added first.
  await expect(rows.nth(1)).toContainText('Kounatidis');

  const nav = library.getByRole('navigation', { name: 'Collections' });
  await nav.getByRole('button', { name: /^Thesis/ }).click();
  await expect(rows).toHaveCount(3);
  await nav.getByRole('button', { name: /^Chapter 2 AMPs/ }).click();
  await expect(rows).toHaveCount(2);
  await nav.getByRole('button', { name: /^Unfiled/ }).click();
  await expect(rows.nth(1)).toContainText('A paper in no collection');
  // A tag narrows the chosen collection, as in Zotero.
  await nav.getByRole('button', { name: 'review' }).click();
  await expect(rows).toHaveCount(0);
  await nav.getByRole('button', { name: /^All references/ }).click();
  await nav.getByRole('button', { name: 'review' }).click();
  await expect(rows).toHaveCount(2);
  await nav.getByRole('button', { name: /^All references/ }).click();

  await library.getByRole('button', { name: 'Year' }).click();
  await expect(rows.nth(1)).toContainText('2017');
  await library.getByRole('button', { name: /^Year/ }).click();
  await expect(rows.nth(1)).toContainText('2010');

  await library.getByRole('searchbox').fill('innate immunity');
  await expect(rows).toHaveCount(2);
  await library.getByRole('button', { name: 'Immunity in Drosophila melanogaster' }).click();
  const details = library.getByRole('complementary', { name: 'Reference details' });
  await expect(details).toContainText('Nicolas Buchon, Neal Silverman, Sara Cherry');
  await expect(details).toContainText('Nature Reviews Immunology');
  await expect(details).toContainText('Chapter 2 AMPs');
  await expect(details).toContainText('#review');
  await expect(details).toContainText('fruit fly');
  await expect(
    details.getByRole('button', { name: 'Copy citation [@Buchon2014-rs]' }),
  ).toBeVisible();
  await expect(details.getByRole('button', { name: 'Open DOI' })).toBeVisible();
  await details.getByRole('button', { name: 'Make literature note' }).click();
  await expect(page.locator('.page-editor')).toBeVisible();
});

test('downloads missing PDFs for matching references and skips saved papers on retry', async ({
  page,
}) => {
  const bytes = readFileSync(new URL('./fixtures/paper.pdf', import.meta.url));
  let downloads = 0;
  await page.route('https://papers.example/**', (route) => {
    downloads++;
    return route.fulfill({
      contentType: 'application/pdf',
      body: bytes,
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  const library = await openLibrary(page, {
    'references/library.json': JSON.stringify([
      { id: 'available', title: 'Matched paper', URL: 'https://papers.example/article.pdf' },
      { id: 'unavailable', title: 'Matched citation only' },
      { id: 'other', title: 'Different paper', URL: 'https://papers.example/other.pdf' },
    ]),
  });
  await library.getByRole('searchbox').fill('Matched');
  const download = library.getByRole('button', { name: 'Download missing PDFs in results' });
  await download.click();
  await expect(library.getByText('PDFs saved: 1. Still missing: 1.')).toBeVisible();
  const row = library.getByRole('row').filter({ hasText: 'Matched paper' });
  await expect(row.getByText('PDF', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Matched paper' }).click();
  await expect(
    library
      .getByRole('complementary', { name: 'Reference details' })
      .getByRole('button', { name: 'Open PDF' }),
  ).toBeVisible();
  await download.click();
  await expect(library.getByText('PDFs saved: 0. Still missing: 1.')).toBeVisible();
  expect(downloads).toBe(1);
});
