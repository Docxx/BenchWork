import { useEffect, useRef, useState } from 'react';
import type { LabelPrinter } from './printer';

const key = 'benchwork.label-studio.printer';
function preferences(): { id: string; auto: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown> | null;
    return {
      id: typeof value?.['id'] === 'string' ? value['id'] : '',
      auto: value?.['auto'] !== false,
    };
  } catch {
    return { id: '', auto: true };
  }
}
function remember(id: string, auto: boolean) {
  try {
    localStorage.setItem(key, JSON.stringify({ id, auto }));
  } catch {
    /* Bluetooth still works without preferences. */
  }
}

/** Reconnect only a previously chosen native printer. Never retry print jobs. */
export function usePrinterConnection(
  printer: Pick<LabelPrinter, 'connect' | 'close' | 'isConnected'>,
  native: boolean,
  paused: boolean,
) {
  const [prefs, setPrefs] = useState(preferences);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState('Not connected');
  const flight = useRef<Promise<void> | null>(null);
  const alive = useRef(false);
  const owner = useRef<{ printer: typeof printer } | null>(null);
  const autoRef = useRef(prefs.auto);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    alive.current = true;
    const session = { printer };
    owner.current = session;
    return () => {
      alive.current = false;
      const pending = flight.current;
      void Promise.resolve()
        .then(async () => {
          // React's development remount retains this same printer instance.
          if (owner.current !== session && owner.current?.printer === printer) return;
          await pending?.catch(() => undefined);
          await printer.close();
        })
        .catch(() => undefined);
    };
  }, [printer]);

  async function connect(id: string) {
    if (flight.current) return flight.current;
    setConnecting(true);
    setConnected(false);
    setName('Connecting…');
    const pending = (async () => {
      try {
        const info = await printer.connect(id);
        if (!alive.current) return;
        remember(id, autoRef.current);
        setPrefs({ id, auto: autoRef.current });
        setConnected(true);
        setName(
          `B3S · firmware ${info.softwareVersion ?? 'unknown'} · battery ${String(info.batteryPercents ?? '?')}%`,
        );
      } catch (err) {
        if (alive.current) setName('Printer unavailable. Turn it on nearby to reconnect.');
        throw err;
      } finally {
        flight.current = null;
        if (alive.current) setConnecting(false);
      }
    })();
    flight.current = pending;
    return pending;
  }

  useEffect(() => {
    if (!native || !prefs.auto || !prefs.id) return;
    const check = () => {
      if (!autoRef.current || pausedRef.current || flight.current) return;
      if (printer.isConnected()) return;
      setConnected(false);
      void connect(prefs.id).catch(() => undefined);
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      clearInterval(timer);
    };
    // connect uses stable printer and state setters; prefs controls the retry lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, prefs.auto, prefs.id, printer]);

  function setAuto(auto: boolean) {
    autoRef.current = auto;
    remember(prefs.id, auto);
    setPrefs((p) => ({ ...p, auto }));
  }
  async function disconnect() {
    setAuto(false);
    await flight.current?.catch(() => undefined);
    await printer.close();
    if (alive.current) {
      setConnected(false);
      setName('Not connected');
      // An in-flight connection may have saved auto=true before closing.
      remember(prefs.id, false);
      setPrefs((p) => ({ ...p, auto: false }));
    }
  }
  return { connected, connecting, name, connect, disconnect, autoConnect: prefs.auto, setAuto };
}
