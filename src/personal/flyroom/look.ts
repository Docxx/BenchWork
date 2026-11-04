import { createContext, useContext } from 'react';
import { DEFAULT_MARKERS, type Marker } from './genetics';

/** How genotypes are drawn, chosen in Fly room and kept with its settings. */
export interface Look {
  /** Copies one over the other, as on paper, or one line such as `w ; Sco/CyO`. */
  genotypes: 'fractions' | 'line';
  /** Each chromosome in its own colour, with balancers marked. */
  colour: boolean;
}

export const DEFAULT_LOOK: Look = { genotypes: 'fractions', colour: false };

export function parseLook(raw: unknown): Look {
  const look = { ...DEFAULT_LOOK };
  if (typeof raw !== 'object' || raw === null) return look;
  const r = raw as Record<string, unknown>;
  if (r['genotypes'] === 'line' || r['genotypes'] === 'fractions') look.genotypes = r['genotypes'];
  if (typeof r['colour'] === 'boolean') look.colour = r['colour'];
  return look;
}

/** The look in use, and the markers that say what a balancer is. */
export const LookContext = createContext<{ look: Look; markers: readonly Marker[] }>({
  look: DEFAULT_LOOK,
  markers: DEFAULT_MARKERS,
});

export function useLook() {
  return useContext(LookContext);
}
