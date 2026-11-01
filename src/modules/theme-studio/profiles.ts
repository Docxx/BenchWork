import { parseAppearance, type Appearance } from '@core/api';
export interface Profile {
  id: string;
  name: string;
  purpose: 'personal' | 'teaching' | 'presenting';
  appearance: Appearance;
}
export function parseProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') throw new Error('Invalid theme profile.');
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    !v.appearance ||
    typeof v.appearance !== 'object'
  )
    throw new Error('This profile needs a name and appearance.');
  return {
    id: typeof v.id === 'string' ? v.id : crypto.randomUUID(),
    name: v.name.slice(0, 100),
    purpose: v.purpose === 'teaching' || v.purpose === 'presenting' ? v.purpose : 'personal',
    appearance: parseAppearance(v.appearance),
  };
}
export function readPack(text: string): Profile {
  if (text.length > 15_000_000) throw new Error('Choose a theme pack smaller than 15 MB.');
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object') throw new Error('Invalid theme pack.');
  const p = raw as Record<string, unknown>;
  if (p.format !== 'benchwork-theme' || p.version !== 1)
    throw new Error('This is not a supported BenchWork theme pack.');
  return { ...parseProfile(p.profile), id: crypto.randomUUID() };
}
export function writePack(profile: Profile): string {
  return JSON.stringify(
    { format: 'benchwork-theme', version: 1, profile: parseProfile(profile) },
    null,
    2,
  );
}
export async function mediaUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The media could not be read.'));
    };
    reader.onerror = () => {
      reject(new Error('The media could not be read.'));
    };
    reader.readAsDataURL(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
  });
}
