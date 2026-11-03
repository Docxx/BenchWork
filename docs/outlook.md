# Outlook for BenchWork

The optional **Outlook** module connects a work or university Microsoft 365 account
through Microsoft Graph. Enable it under **Settings > Modules**, then open Outlook
under Tools. Each device signs in independently.

## Registering the Microsoft application

1. Sign in to [Microsoft Entra](https://entra.microsoft.com/) with the work account.
2. Open **Identity > Applications > App registrations > New registration**.
3. Name the application **BenchWork**. Select **Accounts in this organisational
   directory only** for a registration restricted to your university. Leave the
   redirect URI blank for device-code sign-in.
4. Under **Authentication > Advanced settings**, enable **Allow public client flows**.
5. Under **API permissions > Add a permission > Microsoft Graph > Delegated
   permissions**, add `User.Read`, `Mail.ReadWrite`, `Mail.Send` and
   `Calendars.ReadWrite`. Grant consent through the organisation's normal process.
6. From Overview, copy the **Application (client) ID** and **Directory (tenant) ID**
   into BenchWork's connection form. Do not create or enter a client secret.
7. Choose **Connect Microsoft 365**. Open the Microsoft sign-in page using the
   button, enter the displayed code, sign in and review the requested permissions.

The sign-in request also asks for `offline_access` to renew the session. Tokens
never go into a note, a vault file or the shared module configuration.

If app registration is blocked, IT must register or approve the application. Do not
try to bypass organisation policy. A request to send them:

> Please register BenchWork as a single-tenant public-client application for my
> Microsoft 365 account. It needs device-code sign-in, if permitted, and Microsoft
> Graph delegated permissions User.Read, Mail.ReadWrite, Mail.Send and
> Calendars.ReadWrite. Please provide the Application (client) ID and Directory
> (tenant) ID. No client secret is required. Access should be limited to approved
> users under our usual policies.

An organisation can also block device-code sign-in or user consent. If so, IT needs
to review the connection; this version cannot bypass those restrictions. A live
account connection has not been verified until that registration and consent are
available. The test suite uses simulated Microsoft responses and never sends live
mail.

## Mail and calendar

- Browse Inbox, All mail, Sent, Drafts, Archive, Deleted items, custom folders and
  subfolders. Load older emails and additional folder pages on demand.
- Search the selected folder online; offline searches use recent cached summaries.
- Read formatted messages with scripts, forms, remote images and active content
  removed. Links open in the device's browser. Reading does not automatically mark
  an email as read.
- Compose plain-text email, reply, reply all and forward; save drafts to Outlook or review and send.
  Local editor drafts are encrypted on this device and survive leaving the module.
  Close editor discards its local copy after confirmation, unless already saved as
  an Outlook draft.
- Mark read/unread, flag, archive, move to another folder or move to Deleted items.
  This interface does not offer permanent deletion.
- Add files below 3 MB each, with a 5 MB combined editor limit. Larger attachments,
  shared mailboxes and specialised Outlook workflows remain available in Outlook.
  Save received file attachments explicitly into `Outlook attachments/` in the
  current vault. A free filename is chosen so existing files are not overwritten.
  Saving to the vault makes that exported file part of normal vault backups/sync.
- View week, month or 30-day calendar ranges across the account's calendars, including
  recurring occurrences returned by Graph. Create and edit events, invite attendees,
  delete events and accept/tentatively accept/decline invitations. Invitations and
  changes that notify attendees ask for confirmation. Use Outlook for recurring
  series changes, meetings organised by somebody else and advanced recurrence.
- Add the Outlook overview widget to Home or a side dock. Cached event markers
  appear in Home's calendar after the calendar has been loaded in the module.

Only an explicit Send action sends a message. Transport failures do not cause
automatic send retries. Microsoft may accept an action even if the connection
breaks before BenchWork sees the result; check Outlook before repeating a send or
event creation. New-event requests reuse a transaction ID while the editor is open.

## Offline data and protection

When enabled, this device keeps up to 200 recent mail summaries, 10 opened bodies
under 300,000 characters each, folder/calendar metadata and recently viewed calendar
events. This is a bounded recent cache, not a full mailbox archive. Attachments are
not fetched automatically. Offline lists are clearly labelled as recent cached
emails from all folders; uncached bodies, older emails and online actions require a
connection. Local compose recovery is separate from the optional received-mail cache.

**Clear offline cache** clears received mail/calendar cache. **Disconnect account**
removes this device's sign-in, private cached data and local editor draft. It leaves
the Microsoft mailbox and explicitly exported vault attachments alone. Disabling the
module leaves encrypted private data in place so re-enabling can reconnect.

On Windows, native code protects private data with the current user's DPAPI and
stores it in the app configuration folder, outside the vault. On Android, a
non-exportable Keystore AES key protects data in private SharedPreferences using
AES-GCM, with the storage key as authenticated associated data. Do not transfer these
files between devices. macOS secure storage is not implemented in this version.

Native HTTPS is limited to `graph.microsoft.com` and `login.microsoftonline.com`,
with certificate validation, no redirects, timeouts and response size limits. Module
requests must also name the destination host in their manifest. Only Graph account
URLs are accepted as pagination links. Email HTML is sanitised with DOMPurify; remote images, scripts and active content
are blocked.

Implementation: `src/modules/outlook/` owns the UI and Microsoft Graph client.
`ctx.web.request` supplies authenticated Microsoft HTTPS; `ctx.deviceStorage` is
module-scoped encrypted device JSON. Native HTTP uses reqwest with rustls/WebPKI
roots for consistent Windows/Android behaviour. There is no client secret, hosted
proxy, mailbox upload to BenchWork servers or plain-text token file.

Microsoft references:

- [App registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Device authorisation flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
- [Messages API](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- [Calendar ranges and time zones](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
