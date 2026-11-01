import { useEffect, useRef, useState } from 'react';
import { parseAppearance, themePresets, type Appearance, type ModuleContext } from '@core/api';
import { mediaUrl, parseProfile, readPack, writePack, type Profile } from './profiles';
import './themes.css';
import type { ThemeSession } from './session';

export function ThemeStudio({ ctx, session }: { ctx: ModuleContext; session: ThemeSession }) {
  const [appearance, setAppearance] = useState(() => ctx.appearance.current());
  const [name, setName] = useState('My workspace');
  const [purpose, setPurpose] = useState<Profile['purpose']>('personal');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [previewSound, setPreviewSound] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  async function load() {
    const raw = await ctx.storage.read('profiles.json');
    if (raw !== null && !Array.isArray(raw))
      throw new Error('Saved profiles could not be read. The file has been kept unchanged.');
    return Array.isArray(raw) ? raw.map(parseProfile) : [];
  }
  useEffect(() => {
    let active = true;
    void ctx.storage
      .read('profiles.json')
      .then((raw) => {
        if (raw !== null && !Array.isArray(raw))
          throw new Error('Saved profiles could not be read. The file has been kept unchanged.');
        const values = Array.isArray(raw) ? raw.map(parseProfile) : [];
        if (active) {
          setProfiles(values);
          setLoaded(true);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      audio.current?.pause();
    };
  }, [ctx]);
  useEffect(() => {
    audio.current?.pause();
    audio.current = null;
  }, [appearance.ambientSound]);
  useEffect(() => {
    if (audio.current) audio.current.volume = (appearance.ambientVolume ?? 25) / 100;
  }, [appearance.ambientVolume]);
  function patch(value: Partial<Appearance>) {
    setAppearance((a) => parseAppearance({ ...a, ...value }));
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await session.perform(task);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const current = (): Profile => ({
    id: selected || crypto.randomUUID(),
    name: name.trim() || 'My workspace',
    purpose,
    appearance: parseAppearance(appearance),
  });
  async function save(copy = false) {
    if (!loaded) throw new Error('Reload saved profiles before saving changes.');
    const profile = {
      ...current(),
      id: copy ? crypto.randomUUID() : selected || crypto.randomUUID(),
    };
    const next = [...profiles.filter((p) => p.id !== profile.id), profile];
    if (JSON.stringify(next).length > 48_000_000)
      throw new Error(
        'These profiles exceed 48 MB. Use smaller background images or audio clips before saving another profile.',
      );
    await ctx.storage.write('profiles.json', next);
    setProfiles(next);
    setSelected(profile.id);
    setStatus('Profile saved.');
  }
  async function chooseMedia(kind: 'image' | 'audio') {
    const [source] = await ctx.vault.pickFiles({
      title: kind === 'image' ? 'Choose a background image' : 'Choose ambient audio',
      multiple: false,
    });
    if (!source) return;
    const suffix = source.split('.').at(-1)?.toLowerCase() ?? '';
    const types: Record<string, string> =
      kind === 'image'
        ? {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif',
          }
        : { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' };
    const mime = types[suffix];
    if (!mime)
      throw new Error(
        kind === 'image'
          ? 'Choose a PNG, JPEG, WebP or GIF image.'
          : 'Choose MP3, Ogg, WAV or M4A audio.',
      );
    const size = (await ctx.vault.fileInfo(source, true)).size;
    const limit = kind === 'image' ? 4_000_000 : 5_500_000;
    if (size > limit)
      throw new Error(
        `Choose ${kind === 'image' ? 'an image smaller than 4 MB' : 'audio smaller than 5.5 MB'}.`,
      );
    const path = await ctx.files.importFile(source, `Teaching/Theme assets/${crypto.randomUUID()}`);
    const url = await mediaUrl(await ctx.vault.readBytes(path), mime);
    patch(kind === 'image' ? { workspaceImage: url } : { ambientSound: url });
  }
  return (
    <div className="theme-studio">
      <header>
        <span>YOUR WORKSPACE, YOUR ATMOSPHERE</span>
        <h1>Theme Studio</h1>
        <p>
          Build a look for focused work, teaching or presenting. Save it, then take it with you.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!loaded && !busy && (
        <button
          onClick={() => {
            void run(async () => {
              setProfiles(await load());
              setLoaded(true);
            });
          }}
        >
          Retry loading profiles
        </button>
      )}
      <div className="theme-studio-layout">
        <aside>
          <h2>Profiles</h2>
          <button
            disabled={busy}
            onClick={() => {
              setSelected('');
              setName('My workspace');
              setPurpose('personal');
              setAppearance(ctx.appearance.current());
            }}
          >
            + Capture current appearance
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              aria-pressed={selected === p.id}
              disabled={busy}
              onClick={() => {
                setSelected(p.id);
                setName(p.name);
                setPurpose(p.purpose);
                setAppearance(p.appearance);
              }}
            >
              <strong>{p.name}</strong>
              <small>{p.purpose}</small>
            </button>
          ))}
          <button
            disabled={busy || !loaded}
            onClick={() => {
              void run(async () => {
                const [source] = await ctx.vault.pickFiles({
                  title: 'Choose a BenchWork theme pack',
                  multiple: false,
                });
                if (!source) return;
                if ((await ctx.vault.fileInfo(source, true)).size > 15_000_000)
                  throw new Error('Choose a theme pack smaller than 15 MB.');
                const path = await ctx.files.importFile(
                  source,
                  `Teaching/Theme assets/${crypto.randomUUID()}`,
                );
                const profile = readPack(await ctx.vault.readText(path));
                setSelected('');
                setName(profile.name);
                setPurpose(profile.purpose);
                setAppearance(profile.appearance);
                setStatus('Pack loaded for preview. Apply or save it when ready.');
              });
            }}
          >
            Import theme pack
          </button>
        </aside>
        <main>
          <section
            className="theme-preview"
            data-preset={appearance.preset}
            style={
              {
                background: appearance.workspaceImage
                  ? `linear-gradient(#101826bb,#101826bb),url("${appearance.workspaceImage}") center/cover`
                  : 'linear-gradient(135deg,#111d30,#192d46)',
                color: '#f2f7ff',
                '--preview-accent': appearance.accent ?? '#68dbef',
              } as React.CSSProperties
            }
          >
            <div
              className={`theme-preview-stars motion-${appearance.motion ? (appearance.studioMotion ?? 'off') : 'off'}`}
            />
            <span>{purpose.toUpperCase()}</span>
            <h2
              style={{
                fontFamily:
                  appearance.headingFont === 'serif'
                    ? 'Georgia,serif'
                    : appearance.headingFont === 'mono'
                      ? 'monospace'
                      : 'sans-serif',
              }}
            >
              {name || 'My workspace'}
            </h2>
            <p>Room to think. Space to explore.</p>
            <div className="theme-preview-widgets">
              <div>
                Today
                <br />
                <strong>A fresh perspective</strong>
              </div>
              <div>
                Teaching
                <br />
                <strong>Your next great idea</strong>
              </div>
            </div>
            <small>Atmosphere preview. Apply to see the full theme palette.</small>
          </section>
          <section className="theme-controls">
            <label>
              Profile name
              <input
                value={name}
                maxLength={100}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <label>
              Purpose
              <select
                aria-label="Purpose"
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value as Profile['purpose']);
                }}
              >
                <option value="personal">Personal work</option>
                <option value="teaching">Teaching</option>
                <option value="presenting">Presenting</option>
              </select>
            </label>
            <label>
              Base theme
              <select
                value={appearance.preset}
                onChange={(e) => {
                  patch({ preset: e.target.value as Appearance['preset'] });
                }}
              >
                {themePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Accent
              <input
                type="color"
                value={appearance.accent ?? '#68dbef'}
                onChange={(e) => {
                  patch({ accent: e.target.value });
                }}
              />
            </label>
            <button
              onClick={() => {
                patch({ accent: null });
              }}
            >
              Use theme accent
            </button>
            {(['headingFont', 'bodyFont'] as const).map((f) => (
              <label key={f}>
                {f === 'headingFont' ? 'Heading font' : 'Page font'}
                <select
                  value={appearance[f]}
                  onChange={(e) => {
                    patch({ [f]: e.target.value });
                  }}
                >
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </label>
            ))}
            <label>
              Density
              <select
                value={appearance.density}
                onChange={(e) => {
                  patch({ density: e.target.value as Appearance['density'] });
                }}
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="roomy">Roomy</option>
              </select>
            </label>
            <label>
              Workspace motion
              <select
                value={appearance.studioMotion ?? 'off'}
                onChange={(e) => {
                  patch({
                    studioMotion: e.target.value as NonNullable<Appearance['studioMotion']>,
                    motion: e.target.value !== 'off',
                  });
                }}
              >
                <option value="off">Still</option>
                <option value="stars">Drifting stars</option>
                <option value="drift">Soft glow</option>
              </select>
            </label>
            <label>
              Background dimming
              <input
                type="range"
                min={0}
                max={100}
                value={appearance.workspaceDim ?? 85}
                onChange={(e) => {
                  patch({ workspaceDim: Number(e.target.value) });
                }}
              />
            </label>
            <label>
              Ambient volume
              <input
                type="range"
                min={0}
                max={100}
                value={appearance.ambientVolume ?? 25}
                onChange={(e) => {
                  patch({ ambientVolume: Number(e.target.value) });
                }}
              />
            </label>
          </section>
          <div className="theme-studio-actions">
            <button
              disabled={busy}
              onClick={() => {
                void run(() => chooseMedia('image'));
              }}
            >
              Choose background
            </button>
            <button
              onClick={() => {
                patch({ workspaceImage: null });
              }}
            >
              Clear background
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(() => chooseMedia('audio'));
              }}
            >
              Choose ambient sound
            </button>
            <button
              disabled={!appearance.ambientSound}
              onClick={() => {
                void run(async () => {
                  if (previewSound) {
                    audio.current?.pause();
                    setPreviewSound(false);
                  } else {
                    audio.current ??= new Audio(appearance.ambientSound ?? '');
                    audio.current.onpause = () => {
                      setPreviewSound(false);
                    };
                    audio.current.loop = true;
                    audio.current.volume = (appearance.ambientVolume ?? 25) / 100;
                    await audio.current.play();
                    setPreviewSound(true);
                  }
                });
              }}
            >
              {previewSound ? 'Stop sound preview' : 'Preview sound'}
            </button>
            <button
              onClick={() => {
                patch({ ambientSound: null });
              }}
            >
              Clear sound
            </button>
          </div>
          <div className="theme-studio-actions">
            <button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await ctx.appearance.apply(parseAppearance(appearance));
                  setStatus(
                    'Appearance applied. Start ambient sound with the workspace sound button.',
                  );
                });
              }}
            >
              Apply appearance
            </button>
            <button
              disabled={busy || !loaded}
              onClick={() => {
                void run(() => save());
              }}
            >
              Save profile
            </button>
            <button
              disabled={busy || !loaded || !selected}
              onClick={() => {
                void run(() => save(true));
              }}
            >
              Save as new profile
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const pack = writePack(current());
                  const folder = 'Teaching/Theme packs';
                  await ctx.vault.ensureDir(folder);
                  const file = await ctx.vault.freeName(folder, 'BenchWork theme', '.theme.json');
                  const path = `${folder}/${file}`;
                  await ctx.vault.createNew(path, pack);
                  setStatus(
                    `Theme pack saved: ${path}. Share this file to use it on another device.`,
                  );
                });
              }}
            >
              Export theme pack
            </button>
          </div>
          <p className="theme-studio-hint">
            Profiles capture appearance only. Local images and audio are embedded in exported packs.
            Sound starts only when you press play. Motion respects reduced-motion settings.
          </p>
        </main>
      </div>
    </div>
  );
}
