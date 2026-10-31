import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Use the memory platform');
    const now = new Date();
    const end = new Date(now.getTime() + 3600_000);
    const folder = {
      id: 'folder-inbox',
      displayName: 'Research inbox',
      unreadItemCount: 1,
      childFolderCount: 0,
    };
    const mail = {
      id: 'mail-1',
      subject: 'Experiment planning',
      from: { emailAddress: { name: 'Test Colleague', address: 'colleague@example.edu' } },
      toRecipients: [{ emailAddress: { address: 'researcher@example.edu' } }],
      ccRecipients: [],
      replyTo: [],
      receivedDateTime: now.toISOString(),
      bodyPreview: 'Let’s discuss the next experiment.',
      isRead: false,
      isDraft: false,
      hasAttachments: true,
      body: {
        contentType: 'html',
        content:
          '<p>Let’s discuss <strong>the next experiment</strong>.</p><img src="https://tracking.invalid/pixel"><script>window.outlookUnsafe=true</script><a href="javascript:alert(1)">Unsafe link</a>',
      },
    };
    const calendar = { id: 'calendar-1', name: 'Research calendar', canEdit: true };
    const event = {
      id: 'event-1',
      subject: 'Lab meeting',
      start: { dateTime: now.toISOString().replace('Z', ''), timeZone: 'UTC' },
      end: { dateTime: end.toISOString().replace('Z', ''), timeZone: 'UTC' },
      isOrganizer: true,
      location: { displayName: 'Lab office' },
      bodyPreview: 'Review results',
      attendees: [],
    };
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1,"modules":{"outlook":{"enabled":true}}}',
      'Research/Notes.md': '# Notes\n',
    });
    await memory.secureWrite(
      'outlook.account.json',
      JSON.stringify({
        settings: {
          clientId: '11111111-1111-1111-1111-111111111111',
          tenant: 'organizations',
          cache: true,
        },
        profile: {
          id: 'user',
          displayName: 'Test Researcher',
          mail: 'researcher@example.edu',
          userPrincipalName: 'researcher@example.edu',
        },
        tokens: {
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires: Date.now() + 3600_000,
        },
        cache: {
          messages: [mail],
          bodies: { 'mail-1': mail },
          folders: [folder],
          calendars: [calendar],
          events: [{ ...event, calendarId: calendar.id, calendarName: calendar.name }],
          savedAt: now.toISOString(),
        },
      }),
    );
    memory.httpHandler = (request) => {
      memory.fetched.push(`${request.method} ${request.url}`);
      const url = new URL(request.url);
      let data: unknown = {};
      let status = 200;
      if (request.method === 'GET') {
        if (url.pathname.endsWith('/attachments/attachment-1'))
          data = {
            id: 'attachment-1',
            name: 'results.csv',
            contentType: 'text/csv',
            contentBytes: 'c2FtcGxlLHZhbHVlCkEsNDIK',
          };
        else if (url.pathname.endsWith('/attachments'))
          data = {
            value: [{ id: 'attachment-1', name: 'results.csv', size: 20, contentType: 'text/csv' }],
          };
        else if (url.pathname.endsWith('/calendarView')) data = { value: [event] };
        else if (url.pathname.endsWith('/calendars')) data = { value: [calendar] };
        else if (url.pathname.endsWith('/mailFolders')) data = { value: [folder] };
        else if (url.pathname.includes('/messages/mail-1')) data = mail;
        else data = { value: [mail] };
      } else if (
        url.pathname.endsWith('/createReply') ||
        url.pathname.endsWith('/createReplyAll') ||
        url.pathname.endsWith('/createForward') ||
        url.pathname.endsWith('/messages')
      )
        data = { id: 'draft-1' };
      else if (url.pathname.endsWith('/send')) status = 202;
      else if (request.method === 'PATCH' || request.method === 'DELETE') status = 204;
      return Promise.resolve({
        status,
        body: status === 204 || status === 202 ? '' : JSON.stringify(data),
        retryAfter: null,
      });
    };
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Outlook', exact: true })
    .click();
});

test('reads sanitised mail, preserves a local draft across navigation, then sends only after review', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: /Test Colleague.*Experiment planning/ }).click();
  await expect(page.locator('.outlook-email-body')).toContainText('the next experiment');
  await expect(page.locator('.outlook-email-body img, .outlook-email-body script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Thanks, I will bring the results.');
  await page.keyboard.press('Control+Shift+D');
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Outlook', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'Thanks, I will bring the results.',
  );
  const sentBefore = await page.evaluate(() =>
    window.__benchworkMemory?.fetched.some((r) => r.endsWith('/send')),
  );
  expect(sentBefore).toBe(false);
  await page.getByRole('button', { name: 'Review send', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirm email send' })).toContainText(
    'colleague@example.edu',
  );
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(
    page.getByText('Microsoft accepted your email for sending.', { exact: true }),
  ).toBeVisible();
  const count = await page.evaluate(
    () => window.__benchworkMemory?.fetched.filter((r) => r.endsWith('/send')).length,
  );
  expect(count).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('outlook-mail.png') });
});

test('shows cached mail when offline and renders calendar at tablet width', async ({
  page,
}, testInfo) => {
  await expect(
    page.getByRole('button', { name: /Test Colleague.*Experiment planning/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (memory) memory.httpHandler = () => Promise.reject(new Error('Offline'));
  });
  await page.getByRole('button', { name: 'Refresh Outlook mail', exact: true }).click();
  await expect(page.getByText(/Showing recent cached emails from all folders/)).toBeVisible();
  await page.getByRole('button', { name: /Test Colleague.*Experiment planning/ }).click();
  await expect(page.locator('.outlook-email-body')).toContainText('the next experiment');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lab meeting', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.screenshot({ path: testInfo.outputPath('outlook-calendar-tablet.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('edits calendar events and makes attachment exports explicit vault writes', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Test Colleague.*Experiment planning/ }).click();
  await page.getByRole('button', { name: 'Load attachment list', exact: true }).click();
  await page.getByRole('button', { name: /Save results.csv to vault/ }).click();
  await expect(page.getByRole('heading', { name: 'Save attachment to vault' })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () =>
        window.__benchworkMemory?.exists('Outlook attachments/results.csv'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'View / edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Event title', exact: true }).fill('Updated lab meeting');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Calendar event' })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.__benchworkMemory?.fetched.some(
        (r) => r.startsWith('PATCH ') && r.includes('/events/event-1'),
      ),
    ),
  ).toBe(true);
});
