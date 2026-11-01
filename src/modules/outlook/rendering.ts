import DOMPurify from 'dompurify';
import type { Mail } from './types';

export function safeMailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'img',
      'style',
      'form',
      'input',
      'button',
      'video',
      'audio',
      'picture',
      'source',
      'iframe',
      'object',
      'embed',
      'link',
      'base',
    ],
    FORBID_ATTR: ['style', 'src', 'srcset', 'background', 'id', 'class', 'name'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
}
export function plainMail(mail: Mail): string {
  if (!mail.body) return mail.bodyPreview;
  if (mail.body.contentType.toLowerCase() === 'text') return mail.body.content;
  const html = safeMailHtml(mail.body.content)
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const link of doc.querySelectorAll('a[href]'))
    link.append(` (${link.getAttribute('href') ?? ''})`);
  return doc.body.textContent;
}
