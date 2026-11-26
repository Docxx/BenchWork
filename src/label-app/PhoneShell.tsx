import { useEffect, useState } from 'react';
import { LabelStudio } from '../core/labels/LabelStudio';
import { localLabelWorkspace } from '../core/labels/workspace';
import { parseAppLink } from '../core/links/appLinks';
import { parseLabelDesign, type LabelDesign } from '../core/labels/model';
import type { PlatformAdapter } from '../core/platform';
import type { LabelBluetoothTransport } from '../core/platform/labelBluetooth';
import { cardStore, forgetConnection, keepVault, savedConnection, signIn } from './account';
import { StockView, type StockCard } from './StockView';

const SEEN = 'benchwork.label-studio.labels-seen';

/** Brings in labels saved on the desktop. Returns how many arrived. */
async function fetchLabels(platform: PlatformAdapter): Promise<number> {
  const cards = cardStore(platform);
  if (!cards) return 0;
  const since = Number(localStorage.getItem(SEEN) ?? '0');
  const waiting = await cards.list('label', Number.isFinite(since) ? since : 0);
  if (waiting.length === 0) return 0;
  const workspace = localLabelWorkspace();
  let newest = since;
  let kept = 0;
  for (const entry of waiting) {
    const body = await cards.get<LabelDesign>('label', entry.id);
    if (body) {
      try {
        await workspace.save(parseLabelDesign(body));
        kept += 1;
      } catch (err) {
        console.warn('[labels] A label from the desktop could not be read', entry.id, err);
      }
    }
    newest = Math.max(newest, entry.updated);
  }
  localStorage.setItem(SEEN, String(newest));
  return kept;
}

/** Signing this phone in to the account, so labels and stocks can reach it. */
function Connect({
  platform,
  onConnected,
}: {
  platform: PlatformAdapter;
  onConnected: () => void;
}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [vaults, setVaults] = useState<{ id: string; name: string }[]>([]);
  const [session, setSession] = useState<Awaited<ReturnType<typeof signIn>> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    void work()
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setBusy(false);
        setPassword('');
      });
  };

  return (
    <section className="phone-connect" aria-label="Connect to BenchWork">
      <h2>Connect to BenchWork</h2>
      <p className="hint">
        Sign in with the same username and password as BenchWork on your computer. This phone then
        keeps your labels in step, and shows a fly stock when you scan its vial.
      </p>
      {session === null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            attempt(async () => {
              const found = await signIn(platform, login, password);
              if (found.vaults.length === 1 && found.vaults[0]) {
                await keepVault(found, found.vaults[0].id);
                onConnected();
                return;
              }
              setSession(found);
              setVaults(found.vaults.map((v) => ({ id: v.id, name: v.name })));
            });
          }}
        >
          <label>
            Username
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
              }}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </label>
          <button disabled={busy || !login.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <div className="phone-vaults">
          <p>Which vault?</p>
          {vaults.map((v) => (
            <button
              key={v.id}
              disabled={busy}
              onClick={() => {
                attempt(async () => {
                  await keepVault(session, v.id);
                  onConnected();
                });
              }}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      {problem !== null && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

export function PhoneShell({
  platform,
  transport,
}: {
  platform: PlatformAdapter;
  transport: LabelBluetoothTransport | null;
}) {
  const [connected, setConnected] = useState(savedConnection() !== null);
  const [showConnect, setShowConnect] = useState(false);
  const [scanned, setScannedCode] = useState<string | null>(null);
  const [stock, setStock] = useState<StockCard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** A vial just scanned: clear what was on screen and look this one up. */
  const scan = (code: string | null) => {
    setScannedCode(code);
    setStock(null);
    setProblem(null);
  };

  // A scanned vial, whether the app was already open or started by the scan.
  useEffect(() => {
    const take = (url: string) => {
      const link = parseAppLink(url);
      if (link?.kind === 's') scan(link.code);
    };
    const start = new URL(window.location.href).searchParams.get('s');
    if (start !== null) take(`benchwork://s/${start}`);
    return platform.appLinks?.listen(take);
  }, [platform]);

  // Labels saved on the desktop arrive when the app opens.
  useEffect(() => {
    if (!connected) return;
    void fetchLabels(platform)
      .then((kept) => {
        if (kept > 0)
          setNotice(`${String(kept)} ${kept === 1 ? 'label' : 'labels'} from BenchWork.`);
      })
      .catch((err: unknown) => {
        console.warn('[labels] Could not fetch labels', err);
      });
  }, [connected, platform]);

  useEffect(() => {
    if (scanned === null) return;
    const cards = cardStore(platform);
    if (!cards) {
      queueMicrotask(() => {
        setProblem('Sign in to BenchWork to see this stock.');
      });
      return;
    }
    void cards
      .get<StockCard>('stock', scanned)
      .then((found) => {
        if (found) setStock(found);
        else setProblem(`No stock with code ${scanned}. It may not have reached the phone yet.`);
      })
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : String(err));
      });
  }, [scanned, platform]);

  // Designing and printing never need an account; only labels arriving from
  // BenchWork and scanned vials do.
  if (showConnect) {
    return (
      <>
        <button
          type="button"
          className="phone-signout"
          onClick={() => {
            setShowConnect(false);
          }}
        >
          Back to labels
        </button>
        <Connect
          platform={platform}
          onConnected={() => {
            setConnected(true);
            setShowConnect(false);
          }}
        />
      </>
    );
  }

  if (scanned !== null) {
    return (
      <StockView
        code={scanned}
        stock={stock}
        problem={problem}
        onConnect={
          connected
            ? null
            : () => {
                setShowConnect(true);
              }
        }
        onClose={() => {
          scan(null);
        }}
      />
    );
  }

  return (
    <>
      {notice !== null && (
        <p className="phone-notice" role="status">
          {notice}
        </p>
      )}
      <LabelStudio workspace={localLabelWorkspace()} transport={transport} standalone />
      <button
        type="button"
        className="phone-signout"
        onClick={() => {
          if (connected) {
            forgetConnection();
            setConnected(false);
          } else setShowConnect(true);
        }}
      >
        {connected ? 'Sign out of BenchWork' : 'Connect to BenchWork'}
      </button>
    </>
  );
}
