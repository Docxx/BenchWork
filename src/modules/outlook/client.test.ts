// @vitest-environment node
import { MemoryAdapter } from '../../core/platform/memory';
import type { HttpRequest, HttpResponse } from '@core/api';
import { createModuleContext } from '../../core/modules/context';
import { createContributions } from '../../core/modules/contributions';
import { validateManifest } from '../../core/modules/manifest';
import manifest from './manifest.json';
import { OutlookClient, addresses, graphUrl, eventTime } from './client';
import { emptyCache, type Composer, type Mail } from './types';

const profile = {
  id: 'user',
  displayName: 'Test Researcher',
  mail: 'researcher@example.edu',
  userPrincipalName: 'researcher@example.edu',
};
const settings = {
  clientId: '11111111-1111-1111-1111-111111111111',
  tenant: 'organizations',
  cache: true,
};
const mail = (id = 'mail1'): Mail => ({
  id,
  subject: 'Lab planning',
  from: { emailAddress: { address: 'colleague@example.edu' } },
  bodyPreview: 'Planning notes',
  receivedDateTime: '2026-10-31T12:00:00Z',
  isDraft: false,
  isRead: false,
  hasAttachments: false,
});
const ok = (data: unknown = {}, status = 200): HttpResponse => ({
  status,
  body: status === 204 || status === 202 ? '' : JSON.stringify(data),
  retryAfter: null,
});
async function setup(handler: (request: HttpRequest) => Promise<HttpResponse>, expired = false) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { '.benchwork/config.json': '{"version":1}' } },
  });
  await platform.setVaultRoot('C:/Vault');
  platform.httpHandler = handler;
  const checked = validateManifest(manifest, 'outlook');
  if (!checked.ok) throw new Error('Invalid manifest');
  const { ctx } = createModuleContext(checked.manifest, {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  await ctx.deviceStorage.write('account.json', {
    profile,
    settings,
    tokens: {
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      expires: expired ? 0 : Date.now() + 3600_000,
    },
    cache: emptyCache(),
  });
  const client = new OutlookClient(ctx);
  await client.load();
  return { client, ctx, platform };
}
afterEach(() => vi.useRealTimers());

it('keeps private cached mail outside the vault and bounds the recent cache', async () => {
  const { client, ctx, platform } = await setup(() =>
    Promise.resolve(ok({ value: Array.from({ length: 230 }, (_, i) => mail(String(i))) })),
  );
  await client.mail('inbox');
  expect(client.snapshot().cache.messages).toHaveLength(200);
  expect((await platform.listDir('')).map((entry) => entry.name)).toEqual(['.benchwork']);
  expect(
    (await ctx.deviceStorage.read<{ cache: { messages: Mail[] } }>('account.json'))?.cache.messages,
  ).toHaveLength(200);
  await client.configure({ ...settings, cache: false });
  expect(
    (await ctx.deviceStorage.read<{ cache: { messages: Mail[] } }>('account.json'))?.cache.messages,
  ).toEqual([]);
});
it('uses one refresh for concurrent expired-token requests and rotates the refresh token', async () => {
  let refreshes = 0;
  const { client, ctx } = await setup((request) => {
    if (request.url.includes('/token')) {
      refreshes++;
      return Promise.resolve(
        ok({ access_token: 'new-access', refresh_token: 'rotated', expires_in: 3600 }),
      );
    }
    expect(request.headers?.['Authorization']).toBe('Bearer new-access');
    return Promise.resolve(ok({ value: [] }));
  }, true);
  await Promise.all([client.mail('inbox'), client.calendars()]);
  expect(refreshes).toBe(1);
  expect(
    (await ctx.deviceStorage.read<{ tokens: { refresh_token: string } }>('account.json'))?.tokens
      .refresh_token,
  ).toBe('rotated');
});
it('refuses foreign pagination links before transmitting a bearer token', async () => {
  const handler = vi.fn(() => Promise.resolve(ok({ value: [] })));
  const { client } = await setup(handler);
  await expect(client.mail('inbox', '', 'https://evil.invalid/steal')).rejects.toThrow(
    'unexpected',
  );
  expect(handler).not.toHaveBeenCalled();
  expect(() => graphUrl('https://graph.microsoft.com@evil.invalid/v1.0/me')).toThrow();
  expect(() => graphUrl('/meAnything')).toThrow();
});
it('updates one reply draft, uploads an attachment once, and sends only on the explicit call', async () => {
  const requests: HttpRequest[] = [];
  const { client } = await setup((request) => {
    requests.push(request);
    if (request.url.endsWith('/createReply')) return Promise.resolve(ok({ id: 'reply-draft' }));
    if (request.url.endsWith('/attachments')) return Promise.resolve(ok({ id: 'attachment-1' }));
    return Promise.resolve(ok({}, request.method === 'PATCH' ? 204 : 202));
  });
  const composer: Composer = {
    mode: 'reply',
    sourceId: 'message-1',
    to: 'colleague@example.edu',
    cc: '',
    subject: 'RE: Lab planning',
    text: 'Thank you',
    attachments: [{ name: 'notes.txt', contentBytes: 'aGk=', size: 2 }],
  };
  await client.saveDraft(composer);
  expect(requests.some((r) => r.url.endsWith('/send'))).toBe(false);
  await client.send(composer);
  expect(requests.filter((r) => r.url.endsWith('/createReply'))).toHaveLength(1);
  expect(requests.filter((r) => r.url.endsWith('/attachments'))).toHaveLength(1);
  expect(requests.filter((r) => r.url.endsWith('/send'))).toHaveLength(1);
});
it('does not automatically retry an ambiguous send or a throttled request', async () => {
  let sends = 0;
  const { client } = await setup((request) => {
    if (request.url.endsWith('/send')) {
      sends++;
      return Promise.reject(new Error('Connection interrupted'));
    }
    return Promise.resolve(ok({}, 204));
  });
  const composer: Composer = {
    id: 'draft',
    mode: 'draft',
    to: 'person@example.edu',
    cc: '',
    subject: '',
    text: 'Hello',
    attachments: [],
  };
  await expect(client.send(composer)).rejects.toThrow('Connection interrupted');
  expect(sends).toBe(1);
});
it('preserves a local compose draft between view instances and clears it on disconnect', async () => {
  const { client, ctx } = await setup(() => Promise.resolve(ok({})));
  client.setComposer({
    mode: 'new',
    to: 'colleague@example.edu',
    cc: '',
    subject: 'Local draft',
    text: 'Keep these notes',
    attachments: [],
  });
  await vi.waitFor(async () => {
    expect(await ctx.deviceStorage.read('composer.json')).toMatchObject({
      text: 'Keep these notes',
    });
  });
  const next = new OutlookClient(ctx);
  await next.load();
  expect(next.snapshot().composer?.subject).toBe('Local draft');
  await client.disconnect();
  expect(await ctx.deviceStorage.read('composer.json')).toBeNull();
  expect(await ctx.deviceStorage.read('account.json')).toBeNull();
});
it('polls device sign-in at Microsoft’s interval and cancels without reviving the session', async () => {
  vi.useFakeTimers();
  let polls = 0;
  const { client } = await setup((request) => {
    if (request.url.endsWith('/devicecode'))
      return Promise.resolve(
        ok({
          device_code: 'private-device-code',
          user_code: 'TEST-CODE',
          verification_uri: 'https://microsoft.com/devicelogin',
          expires_in: 900,
          interval: 5,
        }),
      );
    polls++;
    return Promise.resolve(ok({ error: polls === 1 ? 'slow_down' : 'authorization_pending' }));
  });
  await client.connect();
  expect(polls).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(polls).toBe(1);
  await vi.advanceTimersByTimeAsync(9000);
  expect(polls).toBe(1);
  client.cancelSignIn();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(polls).toBe(1);
  expect(client.snapshot().challenge).toBeNull();
});
it('validates recipients and interprets Graph UTC times', () => {
  expect(addresses('one@example.edu; two@example.edu')).toHaveLength(2);
  expect(() => addresses('invalid\r\nBcc: person@example.edu')).toThrow();
  expect(
    eventTime({ dateTime: '2026-10-31T12:00:00.0000000', timeZone: 'UTC' }).toISOString(),
  ).toBe('2026-10-31T12:00:00.000Z');
});
