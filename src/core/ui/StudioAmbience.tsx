import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppStoreContext';
import './studio-effects.css';
/** A changed source creates fresh, paused controls. No theme can start sound by itself. */
export function StudioAmbience() {
  const source = useApp((s) => s.settings.appearance.ambientSound);
  const volume = useApp((s) => s.settings.appearance.ambientVolume ?? 25);
  return source ? <AmbientPlayer key={source} source={source} volume={volume} /> : null;
}
function AmbientPlayer({ source, volume }: { source: string; volume: number }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (audio.current) audio.current.volume = volume / 100;
  }, [volume]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) {
        audio.current?.pause();
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', stop);
    return () => {
      audio.current?.pause();
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);
  return (
    <div className="studio-ambience">
      <button
        type="button"
        className="quiet"
        aria-pressed={playing}
        onClick={() => {
          audio.current ??= new Audio(source);
          audio.current.loop = true;
          audio.current.volume = volume / 100;
          if (playing) {
            audio.current.pause();
            setPlaying(false);
          } else
            void audio.current
              .play()
              .then(() => {
                setPlaying(true);
                setError('');
              })
              .catch(() => {
                setPlaying(false);
                setError('This sound could not be played.');
              });
        }}
      >
        {playing ? 'Pause ambience' : 'Start ambience'}
      </button>
      {error && <span role="status">{error}</span>}
    </div>
  );
}
