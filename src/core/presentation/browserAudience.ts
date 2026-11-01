import type { AudienceDisplay, AudienceFrame } from '../platform/types';
/** Browser stand-in for the native audience window, also used by UI tests. */
export function browserAudience(): AudienceDisplay {
  let channel: BroadcastChannel | null = null;
  let frame: AudienceFrame | null = null;
  let ready: (() => void) | null = null;
  return {
    monitors: () => Promise.resolve([{ index: 0, name: 'Separate browser audience window' }]),
    open: (initial) => {
      frame = initial;
      if (channel) {
        channel.postMessage({ type: 'frame', frame });
        return Promise.resolve();
      }
      const id = crypto.randomUUID();
      channel = new BroadcastChannel(`benchwork-audience-${id}`);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'ready') {
          channel?.postMessage({ type: 'frame', frame });
          ready?.();
        }
      };
      window.open(
        `/audience.html?session=${id}`,
        '_blank',
        'noopener,noreferrer,popup,width=1280,height=720',
      );
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          channel?.close();
          channel = null;
          reject(new Error('Allow the audience popup, then try again.'));
        }, 8000);
        ready = () => {
          clearTimeout(timer);
          ready = null;
          resolve();
        };
      });
    },
    update: (next) => {
      frame = next;
      channel?.postMessage({ type: 'frame', frame });
      return Promise.resolve();
    },
    close: () => {
      channel?.postMessage({ type: 'close' });
      channel?.close();
      channel = null;
      frame = null;
      return Promise.resolve();
    },
  };
}
