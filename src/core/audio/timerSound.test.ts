import { defaultAppearance } from '../settings/appearance';

function fakeAudio(state = 'running') {
  const oscillators: {
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const gains: {
    gain: {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const audio = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => {
      audio.state = 'running';
      return Promise.resolve();
    }),
    createGain: () => {
      const gain = {
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: () => gain,
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const oscillator = {
        frequency: { value: 0 },
        type: 'sine',
        connect: (target: unknown) => target,
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    },
  };
  const constructed = vi.fn();
  vi.stubGlobal('AudioContext', function AudioDevice() {
    constructed();
    return audio;
  });
  return { audio, oscillators, gains, constructed };
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps silent and zero-volume timers silent without opening an audio device', async () => {
  const { constructed } = fakeAudio();
  const { playTimerSound } = await import('./timerSound');
  expect(await playTimerSound({ ...defaultAppearance('bridge'), timerSound: 'off' })).toBe(false);
  expect(await playTimerSound({ ...defaultAppearance('wizard'), timerVolume: 0 })).toBe(false);
  expect(constructed).not.toHaveBeenCalled();
});

it('uses distinct themed cues, with an independent sound override', async () => {
  const { timerSoundProfile } = await import('./timerSound');
  expect(timerSoundProfile(defaultAppearance('bridge'))).toBe('console');
  expect(timerSoundProfile(defaultAppearance('dino'))).toBe('park');
  expect(timerSoundProfile(defaultAppearance('wizard'))).toBe('bells');
  expect(timerSoundProfile(defaultAppearance('forest'))).toBe('classic');
  expect(timerSoundProfile({ ...defaultAppearance('dino'), timerSound: 'chime' })).toBe('bells');
});

it('applies volume, coalesces simultaneous alerts and disconnects finished nodes', async () => {
  const { audio, oscillators, gains } = fakeAudio();
  const { playTimerSound } = await import('./timerSound');
  const appearance = { ...defaultAppearance('bridge'), timerVolume: 50 };
  expect(await playTimerSound(appearance)).toBe(true);
  expect(gains[0]?.gain.value).toBeCloseTo(0.11);
  expect(oscillators.map((o) => o.frequency.value)).toEqual([1175, 1760, 1397]);
  expect(await playTimerSound(appearance)).toBe(false);
  for (const oscillator of oscillators) oscillator.onended?.();
  expect(gains[0]?.disconnect).toHaveBeenCalledOnce();
  expect(oscillators[0]?.disconnect).toHaveBeenCalledOnce();
  audio.currentTime = 2;
  expect(await playTimerSound(appearance)).toBe(true);
});

it('unlocks a reusable context on a gesture and does not wait on autoplay for a timer', async () => {
  const { audio, constructed } = fakeAudio('suspended');
  const { playTimerSound, prepareTimerAudio } = await import('./timerSound');
  expect(await playTimerSound(defaultAppearance())).toBe(false);
  prepareTimerAudio();
  expect(audio.resume).toHaveBeenCalledOnce();
  expect(await playTimerSound(defaultAppearance())).toBe(true);
  expect(constructed).toHaveBeenCalledOnce();
});

it('fails quietly when audio is unsupported or cannot resume', async () => {
  vi.stubGlobal('AudioContext', undefined);
  const { playTimerSound } = await import('./timerSound');
  expect(await playTimerSound(defaultAppearance(), true)).toBe(false);
  const { audio } = fakeAudio('suspended');
  audio.resume.mockRejectedValue(new Error('Unavailable'));
  expect(await playTimerSound(defaultAppearance(), true)).toBe(false);
});
