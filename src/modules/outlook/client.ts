import type { ModuleContext } from '@core/api';
import type {
  Attachment,
  Cache,
  Calendar,
  Challenge,
  Collection,
  Composer,
  Event,
  Folder,
  Mail,
  OutlookState,
  Profile,
  SavedAccount,
  Settings,
  Tokens,
} from './types';
import { emptyCache } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES =
  'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite';
const MAIL_FIELDS =
  'id,subject,from,replyTo,toRecipients,ccRecipients,bccRecipients,receivedDateTime,bodyPreview,isRead,isDraft,hasAttachments,webLink,flag';
export const addresses = (text: string) =>
  text
    .split(/[;,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((address) => {
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))
        throw new Error(`Check this email address: ${address}`);
      return { emailAddress: { address } };
    });
export function graphUrl(path: string): string {
  const url = new URL(path.startsWith('https://') ? path : `${GRAPH}${path}`);
  if (
    url.origin !== 'https://graph.microsoft.com' ||
    !/^\/v1\.0\/me(?:\/|$)/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('Microsoft returned an unexpected page address');
  return url.href;
}
export function eventTime(value: { dateTime: string; timeZone: string }): Date {
  // Calendar requests ask Graph for UTC, including recurring occurrences.
  return new Date(
    /[zZ]|[+-]\d\d:\d\d$/.test(value.dateTime) ? value.dateTime : `${value.dateTime}Z`,
  );
}
export class OutlookClient {
  private listeners = new Set<() => void>();
  private tokens: Tokens | null = null;
  private refreshing: Promise<string> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private serial: Promise<void> = Promise.resolve();
  private generation = 0;
  private composerSerial: Promise<void> = Promise.resolve();
  private disposed = false;
  private state: OutlookState = {
    composer: null,
    ready: false,
    settings: { clientId: '', tenant: 'organizations', cache: true },
    profile: null,
    challenge: null,
    error: '',
    cacheWarning: '',
    cache: emptyCache(),
  };
  constructor(readonly ctx: ModuleContext) {}
  snapshot = (): OutlookState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(change: Partial<OutlookState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  async load(): Promise<void> {
    try {
      const saved = await this.ctx.deviceStorage.read<SavedAccount>('account.json');
      if (saved) {
        this.tokens = saved.tokens;
        this.update({
          settings: saved.settings,
          profile: saved.profile,
          cache: saved.settings.cache ? saved.cache : emptyCache(),
        });
      }
    } catch {
      this.update({
        error:
          'This device could not unlock the saved Outlook account. Disconnect and sign in again.',
      });
    }
    try {
      const composer = await this.ctx.deviceStorage.read<Composer>('composer.json');
      if (composer) this.update({ composer });
    } catch {
      this.update({ cacheWarning: 'A local email draft could not be unlocked on this device.' });
    }
    this.update({ ready: true });
  }
  setComposer(composer: Composer | null): void {
    this.update({ composer });
    this.composerSerial = this.composerSerial
      .then(async () => {
        if (this.state.composer)
          await this.ctx.deviceStorage.write('composer.json', this.state.composer);
        else await this.ctx.deviceStorage.remove('composer.json');
      })
      .catch(() => {
        this.update({
          cacheWarning:
            'The local email draft could not be saved on this device. Save it as an Outlook draft before closing.',
        });
      });
  }
  private save(): Promise<void> {
    this.serial = this.serial
      .then(async () => {
        if (this.disposed) return;
        const saved: SavedAccount = {
          settings: this.state.settings,
          profile: this.state.profile,
          tokens: this.tokens,
          cache: this.state.settings.cache ? this.state.cache : emptyCache(),
        };
        await this.ctx.deviceStorage.write('account.json', saved);
        this.update({ cacheWarning: '' });
      })
      .catch(() => {
        this.update({
          cacheWarning:
            'The account or offline cache could not be saved on this device. Your online actions are unaffected.',
        });
      });
    return this.serial;
  }
  async configure(settings: Settings): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(settings.clientId.trim()))
      throw new Error('Enter the Application (client) ID from the Microsoft app registration.');
    if (settings.tenant !== 'organizations' && !/^[0-9a-f-]{36}$/i.test(settings.tenant))
      throw new Error('Use organizations or the university tenant ID.');
    if (
      this.state.profile &&
      (settings.clientId !== this.state.settings.clientId ||
        settings.tenant !== this.state.settings.tenant)
    )
      throw new Error('Disconnect before changing the app registration.');
    this.update({
      settings: { ...settings, clientId: settings.clientId.trim() },
      ...(settings.cache ? {} : { cache: emptyCache() }),
    });
    await this.save();
  }
  private async auth(
    endpoint: string,
    parameters: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await this.ctx.web.request({
      url: `https://login.microsoftonline.com/${this.state.settings.tenant}/oauth2/v2.0/${endpoint}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters).toString(),
    });
    const value = JSON.parse(response.body) as Record<string, unknown>;
    if (!response.status || response.status >= 500)
      throw new Error('Microsoft sign-in is temporarily unavailable. Try again later.');
    return value;
  }
  async connect(): Promise<void> {
    if (!this.state.settings.clientId)
      throw new Error('Set up the Microsoft app registration first.');
    this.cancelSignIn();
    const generation = this.generation;
    const value = await this.auth('devicecode', {
      client_id: this.state.settings.clientId,
      scope: SCOPES,
    });
    if (value['error'])
      throw new Error(
        this.authError(typeof value['error'] === 'string' ? value['error'] : 'unknown_error'),
      );
    const challenge = value as unknown as Challenge;
    if (!challenge.device_code || !challenge.user_code || !challenge.verification_uri)
      throw new Error('Microsoft did not provide a sign-in code.');
    if (generation !== this.generation || this.disposed) return;
    this.update({ challenge, error: '' });
    const expires = Date.now() + challenge.expires_in * 1000;
    let interval = Math.max(5, challenge.interval || 5) * 1000;
    const poll = async () => {
      if (generation !== this.generation || this.disposed) return;
      if (Date.now() >= expires) {
        this.update({
          challenge: null,
          error: 'The sign-in code expired. Start again for a new code.',
        });
        return;
      }
      try {
        const result = await this.auth('token', {
          client_id: this.state.settings.clientId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: challenge.device_code,
        });
        if (generation !== this.generation) return;
        if (result['error'] === 'authorization_pending' || result['error'] === 'slow_down') {
          if (result['error'] === 'slow_down') interval += 5000;
          this.timer = setTimeout(() => {
            void poll();
          }, interval);
          return;
        }
        if (result['error'])
          throw new Error(
            this.authError(typeof result['error'] === 'string' ? result['error'] : 'unknown_error'),
          );
        this.setTokens(result);
        const profile = await this.api<Profile>(
          '/me?$select=id,displayName,mail,userPrincipalName',
        );
        if (generation !== this.generation) return;
        this.update({ profile, challenge: null });
        await this.save();
      } catch (e) {
        this.update({ challenge: null, error: message(e) });
      }
    };
    this.timer = setTimeout(() => {
      void poll();
    }, interval);
  }
  private setTokens(value: Record<string, unknown>) {
    if (typeof value['access_token'] !== 'string' || typeof value['expires_in'] !== 'number')
      throw new Error('Microsoft did not return a valid sign-in session.');
    this.tokens = {
      access_token: value['access_token'],
      expires: Date.now() + value['expires_in'] * 1000,
      ...(typeof value['refresh_token'] === 'string'
        ? { refresh_token: value['refresh_token'] }
        : this.tokens?.refresh_token
          ? { refresh_token: this.tokens.refresh_token }
          : {}),
    };
  }
  private authError(code: string): string {
    return `Microsoft sign-in could not finish (${code}). Check the app registration, public-client setting and your university's consent policy.`;
  }
  cancelSignIn(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.update({ challenge: null });
  }
  async disconnect(): Promise<void> {
    this.cancelSignIn();
    await this.serial;
    await this.composerSerial;
    await this.ctx.deviceStorage.remove('account.json');
    await this.ctx.deviceStorage.remove('composer.json');
    this.tokens = null;
    this.update({
      composer: null,
      profile: null,
      cache: emptyCache(),
      cacheWarning: '',
      error: '',
    });
  }
  private async token(force = false): Promise<string> {
    if (!this.tokens) throw new Error('Sign in to Microsoft to continue.');
    if (!force && this.tokens.expires > Date.now() + 60_000) return this.tokens.access_token;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    this.refreshing = (async () => {
      if (!this.tokens?.refresh_token) throw new Error('Sign in again to renew this session.');
      const result = await this.auth('token', {
        client_id: this.state.settings.clientId,
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
        scope: SCOPES,
      });
      if (result['error'])
        throw new Error(
          'Microsoft requires you to disconnect and sign in again. Your cached emails are still available.',
        );
      if (generation !== this.generation) throw new Error('The Outlook account changed.');
      this.setTokens(result);
      await this.save();
      return this.tokens.access_token;
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  async api<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const generation = this.generation;
    const url = graphUrl(path);
    const request = async (force: boolean) =>
      this.ctx.web.request({
        url,
        method,
        headers: {
          Authorization: `Bearer ${await this.token(force)}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let response = await request(false);
    if (response.status === 401) response = await request(true);
    if (generation !== this.generation) throw new Error('The Outlook account changed.');
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 429)
        throw new Error(
          `Microsoft is limiting requests. Try again after ${response.retryAfter ?? 'a short wait'} seconds.`,
        );
      if (response.status === 403)
        throw new Error(
          'Microsoft denied this action. Your university may need to approve the app or this mailbox permission.',
        );
      let detail = '';
      try {
        const value = JSON.parse(response.body) as { error?: { code?: string } };
        detail = value.error?.code ?? '';
      } catch {
        /* Empty HTTP error. */
      }
      throw new Error(
        `Microsoft request failed (${String(response.status)}${detail ? `, ${detail}` : ''}).${method === 'POST' ? ' Check Outlook before retrying to avoid duplicate sends or events.' : ''}`,
      );
    }
    return (response.body ? JSON.parse(response.body) : undefined) as T;
  }
  private async cached(change: Partial<Cache>): Promise<void> {
    this.update({ cache: { ...this.state.cache, ...change, savedAt: new Date().toISOString() } });
    await this.save();
  }
  async folders(parent?: string, next?: string): Promise<Collection<Folder>> {
    const result = await this.api<Collection<Folder>>(
      next ??
        `/me/mailFolders${parent ? `/${encodeURIComponent(parent)}/childFolders` : ''}?$top=100&$select=id,displayName,unreadItemCount,childFolderCount,parentFolderId`,
    );
    const map = new Map(this.state.cache.folders.map((f) => [f.id, f]));
    for (const f of result.value) map.set(f.id, f);
    await this.cached({ folders: [...map.values()] });
    return result;
  }
  async mail(folder: string, query = '', next?: string): Promise<Collection<Mail>> {
    const parameters = new URLSearchParams({ $top: '50', $select: MAIL_FIELDS });
    if (query.trim()) parameters.set('$search', JSON.stringify(query.trim().slice(0, 300)));
    else parameters.set('$orderby', 'receivedDateTime desc');
    const result = await this.api<Collection<Mail>>(
      next ??
        `/me/${folder === 'all' ? 'messages' : `mailFolders/${encodeURIComponent(folder)}/messages`}?${parameters.toString()}`,
    );
    const messages = [
      ...new Map([...result.value, ...this.state.cache.messages].map((m) => [m.id, m])).values(),
    ].slice(0, 200);
    // New responses replace cached versions of messages with the same id.
    for (const mail of result.value) {
      const i = messages.findIndex((m) => m.id === mail.id);
      if (i >= 0) messages[i] = mail;
    }
    await this.cached({ messages });
    return result;
  }
  async read(id: string): Promise<Mail> {
    const mail = await this.api<Mail>(
      `/me/messages/${encodeURIComponent(id)}?$select=${MAIL_FIELDS},body`,
    );
    if ((mail.body?.content.length ?? 0) < 300_000) {
      const entries: [string, Mail][] = [
        [id, mail],
        ...Object.entries(this.state.cache.bodies).filter(([key]) => key !== id),
      ];
      const bodies = Object.fromEntries(entries.slice(0, 10));
      await this.cached({ bodies });
    }
    return mail;
  }
  async attachments(id: string): Promise<Attachment[]> {
    return (
      await this.api<Collection<Attachment>>(
        `/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,contentType&$top=100`,
      )
    ).value;
  }
  async attachment(mail: string, id: string): Promise<Attachment> {
    return this.api(
      `/me/messages/${encodeURIComponent(mail)}/attachments/${encodeURIComponent(id)}`,
    );
  }
  async organise(
    id: string,
    change: { isRead?: boolean; flag?: { flagStatus: string } },
  ): Promise<void> {
    await this.api(`/me/messages/${encodeURIComponent(id)}`, 'PATCH', change);
    const cache = this.state.cache;
    const mail = cache.bodies[id];
    await this.cached({
      messages: cache.messages.map((m) => (m.id === id ? { ...m, ...change } : m)),
      ...(mail ? { bodies: { ...cache.bodies, [id]: { ...mail, ...change } } } : {}),
    });
  }
  async move(id: string, destination: string): Promise<void> {
    await this.api(`/me/messages/${encodeURIComponent(id)}/move`, 'POST', {
      destinationId: destination,
    });
    await this.removeCached(id);
  }
  async trash(id: string): Promise<void> {
    await this.api(`/me/messages/${encodeURIComponent(id)}`, 'DELETE');
    await this.removeCached(id);
  }
  private async removeCached(id: string) {
    const bodies = Object.fromEntries(
      Object.entries(this.state.cache.bodies).filter(([key]) => key !== id),
    );
    await this.cached({ bodies, messages: this.state.cache.messages.filter((m) => m.id !== id) });
  }
  async saveDraft(composer: Composer): Promise<Mail> {
    const payload = {
      subject: composer.subject,
      body: { contentType: 'Text', content: composer.text },
      toRecipients: addresses(composer.to),
      ccRecipients: addresses(composer.cc),
      bccRecipients: addresses(composer.bcc ?? ''),
    };
    let id = composer.id;
    if (!id && composer.sourceId && composer.mode !== 'new') {
      const action =
        composer.mode === 'reply'
          ? 'createReply'
          : composer.mode === 'replyAll'
            ? 'createReplyAll'
            : 'createForward';
      id = (
        await this.api<Mail>(
          `/me/messages/${encodeURIComponent(composer.sourceId)}/${action}`,
          'POST',
          {},
        )
      ).id;
      composer.id = id;
    }
    const draft = await this.api<Mail>(
      id ? `/me/messages/${encodeURIComponent(id)}` : '/me/messages',
      id ? 'PATCH' : 'POST',
      payload,
    );
    const draftId = id ?? draft.id;
    // Update the caller immediately so retries update the same draft after an attachment failure.
    composer.id = draftId;
    for (const attachment of composer.attachments.filter((a) => !a.id)) {
      const saved = await this.api<Attachment>(
        `/me/messages/${encodeURIComponent(draftId)}/attachments`,
        'POST',
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.name,
          contentType: attachment.contentType ?? 'application/octet-stream',
          contentBytes: attachment.contentBytes,
        },
      );
      attachment.id = saved.id ?? attachment.name;
    }
    return { ...draft, id: draftId };
  }
  async send(composer: Composer): Promise<void> {
    if (
      ![...addresses(composer.to), ...addresses(composer.cc), ...addresses(composer.bcc ?? '')]
        .length
    )
      throw new Error('Add at least one recipient.');
    const draft = await this.saveDraft(composer);
    // Never automatically retry a send after an ambiguous network failure.
    try {
      await this.api(`/me/messages/${encodeURIComponent(draft.id)}/send`, 'POST');
    } catch (error) {
      throw new Error(
        `Sending could not be confirmed. Check Outlook before retrying. ${message(error)}`,
      );
    }
  }
  async calendars(): Promise<Calendar[]> {
    let path: string | undefined = '/me/calendars?$top=100';
    const calendars: Calendar[] = [];
    const seen = new Set<string>();
    while (path) {
      if (seen.has(path) || seen.size >= 20)
        throw new Error('Microsoft returned too many calendar pages.');
      seen.add(path);
      const result: Collection<Calendar> = await this.api(path);
      calendars.push(...result.value);
      path = result['@odata.nextLink'];
    }
    await this.cached({ calendars });
    return calendars;
  }
  async events(calendar: Calendar, from: string, to: string): Promise<Event[]> {
    let path: string | undefined =
      `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView?${new URLSearchParams({ startDateTime: from, endDateTime: to, $top: '250', $orderby: 'start/dateTime', $select: 'id,subject,start,end,isAllDay,isCancelled,isOrganizer,location,bodyPreview,webLink,attendees,recurrence,onlineMeeting,responseStatus' }).toString()}`;
    const events: Event[] = [];
    const seen = new Set<string>();
    while (path) {
      if (seen.has(path) || seen.size >= 20)
        throw new Error('This calendar range is too large. Choose a shorter range.');
      seen.add(path);
      const result: Collection<Event> = await this.api(path);
      events.push(
        ...result.value.map((e) => ({
          ...e,
          calendarId: calendar.id,
          calendarName: calendar.name,
        })),
      );
      path = result['@odata.nextLink'];
    }
    await this.cached({
      events: [
        ...this.state.cache.events.filter((e) => e.calendarId !== calendar.id),
        ...events,
      ].slice(-1500),
    });
    return events;
  }
  async saveEvent(calendar: string, value: Record<string, unknown>, id?: string): Promise<void> {
    await this.api(
      `/me/calendars/${encodeURIComponent(calendar)}/events${id ? `/${encodeURIComponent(id)}` : ''}`,
      id ? 'PATCH' : 'POST',
      value,
    );
  }
  async deleteEvent(event: Event): Promise<void> {
    await this.api(`/me/events/${encodeURIComponent(event.id)}`, 'DELETE');
    await this.cached({ events: this.state.cache.events.filter((e) => e.id !== event.id) });
  }
  async respond(event: Event, action: 'accept' | 'tentativelyAccept' | 'decline'): Promise<void> {
    await this.api(`/me/events/${encodeURIComponent(event.id)}/${action}`, 'POST', {
      sendResponse: true,
    });
  }
  async clearCache(): Promise<void> {
    this.update({ cache: emptyCache() });
    await this.save();
  }
  dispose(): void {
    this.cancelSignIn();
    this.disposed = true;
    this.listeners.clear();
  }
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
