import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AudienceSlide } from './core/presentation/AudienceSlide';
import type { AudienceFrame } from './core/platform/types';
import '@fontsource-variable/inter';

function Audience() {
  const [frame, setFrame] = useState<AudienceFrame | null>(null);
  useEffect(() => {
    const lifecycle = new AbortController();
    const alive = () => !lifecycle.signal.aborted;
    let stop: (() => void) | null = null;
    if (isTauri()) {
      void listen<AudienceFrame>('audience-frame', (event) => {
        if (alive()) setFrame(event.payload);
      })
        .then(async (unlisten) => {
          if (!alive()) {
            unlisten();
            return;
          }
          stop = unlisten;
          const initial = await invoke<AudienceFrame | null>('audience_ready');
          if (alive()) setFrame(initial);
        })
        .catch(() => {
          /* A closed presenter leaves the audience black. */
        });
    } else {
      const id = new URLSearchParams(location.search).get('session');
      if (!id || !/^[a-z0-9-]{1,80}$/i.test(id)) return;
      const channel = new BroadcastChannel(`benchwork-audience-${id}`);
      channel.onmessage = (event: MessageEvent<{ type?: string; frame?: AudienceFrame }>) => {
        if (event.data.type === 'frame' && event.data.frame) setFrame(event.data.frame);
        if (event.data.type === 'close') {
          setFrame(null);
          window.close();
        }
      };
      channel.postMessage('ready');
      stop = () => {
        channel.close();
      };
    }
    return () => {
      lifecycle.abort();
      stop?.();
    };
  }, []);
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#000',
      }}
    >
      {frame && (
        <div style={{ width: 'min(100vw, calc(100vh * 16 / 9))' }}>
          <AudienceSlide frame={frame} />
        </div>
      )}
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Audience />);
