import packageInfo from '../../package.json' with { type: 'json' };
const { version } = packageInfo;
import { expect, test } from '@playwright/test';
async function open(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    memory?.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      'Private/secret.md': 'PRIVATE NOTE CONTENT',
    });
    memory?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
}
test('a tester reviews a report and explicitly opens an email draft without leaking vault data', async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Feedback & bugs', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Feedback & bug reports' });
  await dialog.getByLabel('Title', { exact: true }).fill('Calendar does not update');
  await dialog
    .getByLabel('What happened?', { exact: true })
    .fill('The month stayed unchanged after clicking Next.');
  await dialog
    .getByLabel('Steps to reproduce', { exact: false })
    .fill('Open Home, then click Next month.');
  await expect(dialog.getByLabel('Report preview', { exact: true })).toHaveValue(
    new RegExp('Version: ' + version.replaceAll('.', '\\.')),
  );
  expect(await page.evaluate(() => window.__benchworkMemory?.feedbackDrafts.length)).toBe(0);
  await dialog.getByRole('button', { name: 'Open email draft', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Nothing was sent automatically');
  const draft = await page.evaluate(() => window.__benchworkMemory?.feedbackDrafts[0]);
  expect(draft?.subject).toContain('Calendar does not update');
  expect(draft?.body).not.toMatch(/PRIVATE NOTE CONTENT|C:\/Vault|secret.md/);
  await dialog.screenshot({ path: info.outputPath('feedback-dialog.png') });
  await dialog.getByRole('button', { name: 'Close feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Feedback & bugs', exact: true }).click();
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Calendar does not update');
  await dialog.getByLabel('Include app version, build and device type').uncheck();
  await expect(dialog.getByLabel('Report preview', { exact: true })).not.toHaveValue(/Version:/);
  await page.setViewportSize({ width: 420, height: 900 });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBe(0);
  await dialog.screenshot({ path: info.outputPath('feedback-mobile.png') });
  await dialog.getByRole('button', { name: 'Close feedback', exact: true }).click();
});
test('preview tools can be hidden and restored, and updates open the public release page', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await page.getByRole('button', { name: 'Latest installer', exact: true }).click();
  expect(await page.evaluate(() => window.__benchworkMemory?.openedLinks.at(-1))).toBe(
    'https://github.com/Docxx/BenchWork/releases',
  );
  await page.getByRole('button', { name: 'Hide preview toolbar', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Development preview tools' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Show the temporary feedback toolbar').check();
  await expect(page.getByRole('button', { name: 'Feedback & bugs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Get latest installer', exact: true }).click();
  expect(await page.evaluate(() => window.__benchworkMemory?.openedLinks.at(-1))).toBe(
    'https://github.com/Docxx/BenchWork/releases',
  );
});
