import { defaultAppearance } from '@core/api';
import { parseProfile, readPack, writePack } from './profiles';
it('round-trips a self-contained theme pack without importing scripts, CSS or remote media', () => {
  const profile = parseProfile({
    id: 'one',
    name: 'Seminar',
    purpose: 'presenting',
    appearance: {
      ...defaultAppearance(),
      accent: '#00ffcc',
      workspaceImage: 'https://tracker.invalid/background.png',
      ambientSound: 'javascript:alert(1)',
      studioMotion: 'stars',
      css: 'body {display:none}',
    },
  });
  const restored = readPack(writePack(profile));
  expect(restored.id).not.toBe('one');
  expect(restored).toMatchObject({
    name: 'Seminar',
    purpose: 'presenting',
    appearance: {
      accent: '#00ffcc',
      workspaceImage: null,
      ambientSound: null,
      studioMotion: 'stars',
    },
  });
  expect(restored.appearance).not.toHaveProperty('css');
  expect(() => readPack('{"format":"unknown","version":1}')).toThrow('supported');
  expect(() => readPack('x'.repeat(15_000_001))).toThrow('15 MB');
  expect(() => parseProfile({ name: 'Bad' })).toThrow();
});
