import { safeMailHtml, plainMail } from './rendering';
it('keeps email text and links while removing scripts, tracking images and active content', () => {
  const html = safeMailHtml(
    '<p onclick="alert(1)" style="background:url(https://tracker.invalid)">Hello <strong>researcher</strong></p><img src="https://tracker.invalid/pixel"><script>alert(1)</script><iframe src="https://evil.invalid"></iframe><a href="javascript:alert(1)">bad</a><a href="https://example.edu">good</a><svg onload="alert(1)"></svg>',
  );
  expect(html).toContain('<strong>researcher</strong>');
  expect(html).toContain('href="https://example.edu"');
  expect(html).not.toMatch(/script|iframe|img|tracker|onclick|style=|javascript:|<svg/);
});

it('converts the complete formatted message for drafts and forwards without truncating to its preview', () => {
  const text = plainMail({
    id: '1',
    subject: 'Subject',
    bodyPreview: 'Truncated preview',
    receivedDateTime: '',
    isRead: true,
    isDraft: true,
    hasAttachments: false,
    body: {
      contentType: 'html',
      content:
        '<p>Complete paragraph one.</p><p>Paragraph two with <a href="https://example.edu/data">the dataset</a>.</p>',
    },
  });
  expect(text).toContain('Complete paragraph one.');
  expect(text).toContain('Paragraph two with the dataset (https://example.edu/data).');
  expect(text).not.toContain('Truncated preview');
});
