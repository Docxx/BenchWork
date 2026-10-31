import type { Appearance } from '../settings/appearance';
import { THEME_EXPERIENCES, type SoundProfile } from '../settings/themeExperience';

interface Note {
  frequency: number;
  at: number;
  length: number;
  wave?: OscillatorType;
}

/** Original short cues, synthesised offline. No recordings or music downloads. */
const SCORES: Record<SoundProfile, readonly Note[]> = {
  classic: [0, 0.35, 0.7].map((at) => ({ frequency: 880, at, length: 0.18 })),
  console: [
    { frequency: 1175, at: 0, length: 0.09 },
    { frequency: 1760, at: 0.12, length: 0.1 },
    { frequency: 1397, at: 0.28, length: 0.25 },
  ],
  park: [
    { frequency: 392, at: 0, length: 0.22, wave: 'triangle' },
    { frequency: 523, at: 0.27, length: 0.22, wave: 'triangle' },
    { frequency: 392, at: 0.57, length: 0.45, wave: 'triangle' },
  ],
  bells: [
    { frequency: 659, at: 0, length: 0.65 },
    { frequency: 988, at: 0.17, length: 0.65 },
    { frequency: 1319, at: 0.36, length: 0.85 },
  ],
  orbit: [
    { frequency: 523, at: 0, length: 0.4 },
    { frequency: 784, at: 0.2, length: 0.4 },
    { frequency: 1047, at: 0.4, length: 0.55 },
  ],
  digital: [
    { frequency: 1047, at: 0, length: 0.15, wave: 'triangle' },
    { frequency: 784, at: 0.18, length: 0.15, wave: 'triangle' },
    { frequency: 523, at: 0.36, length: 0.35, wave: 'triangle' },
  ],
  sonar: [
    { frequency: 740, at: 0, length: 0.55 },
    { frequency: 554, at: 0.65, length: 0.65 },
  ],
};

let context: AudioContext | null = null;
let lastPlayed = -Infinity;

function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (context === null || context.state === 'closed') {
    context = new AudioContext();
    lastPlayed = -Infinity;
  }
  return context;
}

/** Prepare on a real pointer or keyboard gesture, so a later timer can sound. */
export function prepareTimerAudio(): void {
  try {
    const audio = audioContext();
    if (audio?.state === 'suspended') void audio.resume().catch(() => undefined);
  } catch {
    // Timer messages remain available when sound cannot be played.
  }
}

export function timerSoundProfile(appearance: Appearance): SoundProfile | null {
  if (appearance.timerSound === 'off' || appearance.timerVolume === 0) return null;
  if (appearance.timerSound === 'classic') return 'classic';
  if (appearance.timerSound === 'chime') return 'bells';
  return THEME_EXPERIENCES[appearance.preset]?.sound ?? 'classic';
}

/** True when a cue was scheduled. Coalesce simultaneous timer completions. */
export async function playTimerSound(appearance: Appearance, preview = false): Promise<boolean> {
  const profile = timerSoundProfile(appearance);
  if (profile === null) return false;
  try {
    const audio = audioContext();
    if (audio === null) return false;
    if (audio.state === 'suspended') {
      // Only previews run directly from a gesture. Timers must not wait on autoplay permission.
      if (!preview) return false;
      await audio.resume();
    }
    if (audio.state !== 'running') return false;
    if (!preview && audio.currentTime - lastPlayed < 1.5) return false;
    lastPlayed = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = (Math.min(100, Math.max(0, appearance.timerVolume)) / 100) * 0.22;
    master.connect(audio.destination);
    let remaining = SCORES[profile].length;
    for (const note of SCORES[profile]) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      const start = audio.currentTime + note.at + 0.02;
      oscillator.type = note.wave ?? 'sine';
      oscillator.frequency.value = note.frequency;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.8, start + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + note.length);
      oscillator.connect(envelope).connect(master);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        remaining -= 1;
        if (remaining === 0) master.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + note.length + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}
