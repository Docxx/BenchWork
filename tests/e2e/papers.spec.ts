import { expect, test } from '@playwright/test';

/** The Latest papers module, with Europe PMC stood in for by the test. */

const SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const ANSWER = JSON.stringify({
  resultList: {
    result: [
      {
        id: '42822610',
        source: 'MED',
        title: 'Tau in the fly eye.',
        authorString: 'Arayesh MJ, Masoudi R.',
        journalInfo: { journal: { title: 'Gene' } },
        firstPublicationDate: '2026-10-29',
        doi: '10.1016/j.gene.2026.150431',
        abstractText: 'Flies with human tau.',
      },
    ],
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    ({ search, answer }) => {
      const memory = window.__benchworkMemory;
      if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
      memory.addFolder('C:/Vault', {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { papers: { enabled: true } },
        }),
      });
      memory.serveWeb(search, answer);
      memory.queuePick('C:/Vault');
    },
    { search: SEARCH, answer: ANSWER },
  );
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});

test('a followed topic shows its papers, on Home too, and a note can be made', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Latest papers' })
    .click();
  await page.getByRole('button', { name: 'Follow a topic' }).click();
  await page.getByLabel('Name').fill('Tau flies');
  await page.getByLabel('Search words').fill('tau AND fly');
  await page.getByRole('button', { name: 'Add topic' }).click();
  const paper = page.getByRole('listitem', { name: 'Tau in the fly eye' });
  await expect(paper).toContainText('Arayesh MJ, Masoudi R · Gene');

  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Home' })
    .click();
  const card = page.getByRole('region', { name: 'Latest papers' });
  await expect(card.getByRole('listitem', { name: 'Tau in the fly eye' })).toBeVisible();

  await card.getByRole('button', { name: 'All papers' }).click();
  await paper.getByRole('button', { name: 'Make a note' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Tau in the fly eye');
  await expect(page.locator('.page-editor')).toContainText('Flies with human tau.');
});
