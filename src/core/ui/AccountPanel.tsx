import { useState, type SyntheticEvent } from 'react';
import { useApp } from './AppStoreContext';
import './desktop-sync.css';

type Mode = 'sign-in' | 'create' | 'recover';

/** Sign in, create an account or use a recovery key. Used on the welcome screen and in Settings. */
export function AccountSignIn() {
  const account = useApp((s) => s.account);
  const ownsVault = useApp((s) => s.cloudConnection()?.owner === true);
  const signIn = useApp((s) => s.signIn);
  const create = useApp((s) => s.createAccount);
  const recover = useApp((s) => s.recoverAccount);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  if (!account.available) return null;
  const busy = account.busy;
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (mode === 'sign-in') void signIn(login, password);
    else if (mode === 'create') void create(login, password, again, code);
    else void recover(login, code, password, again);
  };
  const switchTo = (next: Mode) => {
    setMode(next);
    setPassword('');
    setAgain('');
    setCode('');
  };
  const title = { 'sign-in': 'Sign in', create: 'Create account', recover: 'Forgot password' }[
    mode
  ];
  return (
    <form className="account-form" aria-label={title} onSubmit={submit}>
      <h2>{title}</h2>
      {mode === 'sign-in' && <p>Sign in to sync your vault between your devices.</p>}
      {mode === 'create' && (
        <p className="hint">
          Your notes are encrypted with this password. BenchWork cannot reset it, so you will also
          get a recovery key.
        </p>
      )}
      <label className="field">
        Username
        <input
          autoComplete="username"
          value={login}
          disabled={busy}
          onChange={(e) => {
            setLogin(e.target.value);
          }}
        />
      </label>
      {mode === 'recover' && (
        <label className="field">
          Recovery key
          <input
            autoComplete="off"
            spellCheck={false}
            value={code}
            disabled={busy}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
        </label>
      )}
      <label className="field">
        {mode === 'sign-in' ? 'Password' : 'New password'}
        <input
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          value={password}
          disabled={busy}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </label>
      {mode !== 'sign-in' && (
        <label className="field">
          Type it again
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            disabled={busy}
            onChange={(e) => {
              setAgain(e.target.value);
            }}
          />
        </label>
      )}
      {mode === 'create' && !ownsVault && (
        <label className="field">
          Sign-up code
          <input
            autoComplete="off"
            value={code}
            disabled={busy}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
          <span className="hint">
            Not needed when you create the account from a vault that already uses Cloud sync.
          </span>
        </label>
      )}
      {account.error && (
        <p className="notice" role="alert">
          {account.error}
        </p>
      )}
      {account.progress && <p role="status">{account.progress}…</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {mode === 'sign-in'
            ? 'Sign in'
            : mode === 'create'
              ? 'Create account'
              : 'Set new password'}
        </button>
        {mode === 'sign-in' ? (
          <>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                switchTo('create');
              }}
            >
              Create account
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                switchTo('recover');
              }}
            >
              Forgot password
            </button>
          </>
        ) : (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              switchTo('sign-in');
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}

/** Shown once after the account is made. The key is never stored by BenchWork. */
export function RecoveryKeyDialog() {
  const key = useApp((s) => s.account.recoveryKey);
  const dismiss = useApp((s) => s.dismissRecoveryKey);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!key) return null;
  return (
    <div className="pack-backdrop">
      <section
        className="floating-dialog confirm pack-chooser account-recovery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
      >
        <h2 id="recovery-title" className="dialog-title">
          Your recovery key
        </h2>
        <p>
          If you forget your password, this key lets you set a new one. Keep it somewhere safe,
          outside your vault. BenchWork will not show it again.
        </p>
        <p className="recovery-key">
          <code>{key}</code>
        </p>
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(key).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <label className="choice">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => {
              setSaved(e.target.checked);
            }}
          />
          I have saved my recovery key
        </label>
        <div className="actions">
          <button
            type="button"
            disabled={!saved}
            onClick={() => {
              setSaved(false);
              setCopied(false);
              dismiss();
            }}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

/** The account's vaults that are not open here, to open on this device. */
export function AccountVaults() {
  const account = useApp((s) => s.account);
  const open = useApp((s) => s.openAccountVault);
  const linked = useApp((s) => s.cloudConnection()?.vault ?? '');
  const others = account.vaults.filter((v) => v.id !== linked);
  if (!account.login || !others.length) return null;
  return (
    <section aria-label="Your vaults">
      <h3>Your vaults</h3>
      <ul className="account-list">
        {others.map((v) => (
          <li key={v.id}>
            <span>{v.name}</span>
            <button type="button" disabled={account.busy} onClick={() => void open(v.id)}>
              Open on this device
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Settings > Sync: the account, this vault, devices and password. */
export function AccountSettings() {
  const account = useApp((s) => s.account);
  const opened = useApp((s) => s.status.kind === 'open');
  const relay = useApp((s) => s.relaySync);
  const confirm = useApp((s) => s.confirmRelaySync);
  const link = useApp((s) => s.linkVaultToAccount);
  const loadDevices = useApp((s) => s.loadAccountDevices);
  const remove = useApp((s) => s.removeAccountDevice);
  const change = useApp((s) => s.changeAccountPassword);
  const signOut = useApp((s) => s.signOut);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  if (!account.available)
    return <p>Signing in is available in the installed Windows and Android apps.</p>;
  if (!account.login)
    return (
      <div className="desktop-sync-settings">
        <AccountSignIn />
      </div>
    );
  const busy = account.busy;
  const status = relay.busy
    ? 'Syncing'
    : relay.error
      ? 'Not syncing'
      : relay.lastSync
        ? 'Up to date'
        : 'Waiting to sync';
  return (
    <div className="desktop-sync-settings" aria-label="Account">
      <header>
        <h3>Account</h3>
        <p>Signed in as {account.login}</p>
      </header>
      {account.error && (
        <p className="notice" role="alert">
          {account.error}
        </p>
      )}
      {account.progress && <p role="status">{account.progress}…</p>}
      {opened && (
        <section className="desktop-sync-card">
          <h4>This vault</h4>
          {account.vaultLinked ? (
            <>
              <p role="status">{status}</p>
              {relay.error && <p className="hint">{relay.error}</p>}
            </>
          ) : (
            <>
              <p>This vault does not sync with your account yet.</p>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={relay.confirmed}
                  onChange={(e) => {
                    confirm(e.target.checked);
                  }}
                />
                I stopped Syncthing and other folder sync for this vault
              </label>
              <button type="button" disabled={busy} onClick={() => void link()}>
                Sync this vault with your account
              </button>
            </>
          )}
        </section>
      )}
      <AccountVaults />
      <section className="desktop-sync-card" aria-label="Your devices">
        <h4>Your devices</h4>
        {account.devices.length ? (
          <ul className="account-list">
            {account.devices.map((d) => (
              <li key={d.id}>
                <span>
                  {d.name}
                  {d.current ? ' (this device)' : ''}
                </span>
                {!d.current && (
                  <button type="button" disabled={busy} onClick={() => void remove(d.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" disabled={busy} onClick={() => void loadDevices()}>
            Show devices
          </button>
        )}
        <p className="hint">
          Removing a device stops it syncing. If it was lost, also change your password.
        </p>
      </section>
      <details>
        <summary>Change password</summary>
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void change(current, password, again).then(() => {
              setCurrent('');
              setPassword('');
              setAgain('');
            });
          }}
        >
          <label className="field">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
              }}
            />
          </label>
          <label className="field">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>
          <label className="field">
            Type it again
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => {
                setAgain(e.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={busy}>
            Change password
          </button>
        </form>
      </details>
      <button type="button" disabled={busy} onClick={() => void signOut()}>
        Sign out of this device
      </button>
      <p className="hint">Signing out keeps your files on this device. Syncing stops.</p>
    </div>
  );
}
