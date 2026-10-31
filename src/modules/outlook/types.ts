export interface Address {
  emailAddress: { name?: string; address: string };
}
export interface Mail {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  replyTo?: Address[];
  from?: Address;
  toRecipients?: Address[];
  ccRecipients?: Address[];
  bccRecipients?: Address[];
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  webLink?: string;
  flag?: { flagStatus: string };
  body?: { contentType: string; content: string };
}
export interface Folder {
  id: string;
  displayName: string;
  unreadItemCount: number;
  childFolderCount: number;
  parentFolderId?: string;
}
export interface Calendar {
  id: string;
  name: string;
  color?: string;
  canEdit?: boolean;
}
export interface Event {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  calendarId?: string;
  calendarName?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  location?: { displayName: string };
  bodyPreview?: string;
  webLink?: string;
  attendees?: { emailAddress: { address: string; name?: string }; type: string }[];
  recurrence?: unknown;
  onlineMeeting?: { joinUrl?: string };
  responseStatus?: { response: string };
}
export interface Attachment {
  id?: string;
  name: string;
  size?: number;
  contentType?: string;
  contentBytes?: string;
  '@odata.type'?: string;
}
export interface Composer {
  id?: string;
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  sourceId?: string;
  to: string;
  cc: string;
  bcc?: string;
  subject: string;
  text: string;
  attachments: Attachment[];
}
export interface Settings {
  clientId: string;
  tenant: string;
  cache: boolean;
}
export interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires: number;
}
export interface Profile {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
}
export interface Challenge {
  user_code: string;
  verification_uri: string;
  device_code: string;
  expires_in: number;
  interval: number;
}
export interface Collection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}
export interface Cache {
  messages: Mail[];
  bodies: Record<string, Mail>;
  folders: Folder[];
  calendars: Calendar[];
  events: Event[];
  savedAt: string | null;
}
export const emptyCache = (): Cache => ({
  messages: [],
  bodies: {},
  folders: [],
  calendars: [],
  events: [],
  savedAt: null,
});
export interface OutlookState {
  composer: Composer | null;
  ready: boolean;
  settings: Settings;
  profile: Profile | null;
  challenge: Challenge | null;
  error: string;
  cacheWarning: string;
  cache: Cache;
}
export interface SavedAccount {
  settings: Settings;
  profile: Profile | null;
  tokens: Tokens | null;
  cache: Cache;
}
