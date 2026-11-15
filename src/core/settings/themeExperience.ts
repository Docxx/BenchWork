import type { ThemePreset } from './appearance';

export type SoundProfile = 'classic' | 'console' | 'park' | 'bells' | 'orbit' | 'digital' | 'sonar';

interface ThemeExperience {
  caption: string;
  description: string;
  sound: SoundProfile;
}

/** The atmosphere around the workspace. Page names and controls keep their normal labels. */
export const THEME_EXPERIENCES: Partial<Record<ThemePreset, ThemeExperience>> = {
  arcade: {
    caption: 'Arcade',
    description: 'Pixel cabinets, candy colours and an eighties high-score glow.',
    sound: 'digital',
  },
  miami: {
    caption: 'Miami postcard',
    description: 'Pink sunsets, turquoise waves and a retro seaside postcard.',
    sound: 'orbit',
  },
  mixtape: {
    caption: 'Mixtape',
    description: 'Warm amber, bubblegum labels and a favourite cassette on repeat.',
    sound: 'digital',
  },
  memphis: {
    caption: 'Memphis pop',
    description: 'Playful eighties geometry in turquoise, pink and lemon.',
    sound: 'bells',
  },
  disco: {
    caption: 'Disco violet',
    description: 'Violet velvet, golden records and colourful disco lights.',
    sound: 'bells',
  },
  'indian-ocean': {
    caption: 'Indian Ocean',
    description:
      'A special India and Kenya tribute: warm orange, coastal teal and green in a vintage Indian Ocean travel poster.',
    sound: 'orbit',
  },
  bridge: {
    caption: 'Science station',
    description: 'Amber consoles, lilac panels and a quiet communicator call.',
    sound: 'console',
  },
  dino: {
    caption: 'Field research station',
    description: 'Jungle canopies, park gates and an amber enclosure alert.',
    sound: 'park',
  },
  wizard: {
    caption: 'The candlelit study',
    description: 'Castle spires, aged parchment and a little bell magic.',
    sound: 'bells',
  },
  space: {
    caption: 'Among the stars',
    description: 'Nebula light and an orbital chime.',
    sound: 'orbit',
  },
  neon: {
    caption: 'After hours',
    description: 'Electric pink, cyan light and a digital call.',
    sound: 'digital',
  },
  terminal: {
    caption: 'System ready',
    description: 'Phosphor green and a crisp console signal.',
    sound: 'console',
  },
  mars: {
    caption: 'Surface operations',
    description: 'Copper horizons and a distant station call.',
    sound: 'park',
  },
  galaxy: {
    caption: 'Beyond the outer rim',
    description: 'Starlight, glowing controls and an orbital signal.',
    sound: 'orbit',
  },
  xeno: {
    caption: 'Deep colony',
    description: 'Industrial panels and a soft tracking ping.',
    sound: 'sonar',
  },
  moonlit: {
    caption: 'After the last light',
    description: 'Silver mist and a low, glassy chime.',
    sound: 'bells',
  },
  sparkle: {
    caption: 'A little everyday magic',
    description: 'Pastel starlight and bright little bells.',
    sound: 'bells',
  },
  synthwave: {
    caption: 'Midnight frequency',
    description: 'Sunset neon and a descending digital cue.',
    sound: 'digital',
  },
  deep: {
    caption: 'Below the surface',
    description: 'Bioluminescent blue and a gentle sonar call.',
    sound: 'sonar',
  },
};
