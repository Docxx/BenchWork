export const labelFonts = [
  { id: 'inter', name: 'Inter · clean', family: '"Inter Variable", sans-serif' },
  { id: 'open-sans', name: 'Open Sans · humanist', family: '"BenchWork Open Sans", sans-serif' },
  { id: 'source-serif', name: 'Source Serif · book', family: '"Source Serif 4 Variable", serif' },
  {
    id: 'roboto-mono',
    name: 'Roboto Mono · technical',
    family: '"BenchWork Roboto Mono", monospace',
  },
  { id: 'sans', name: 'Arial · classic', family: 'Arial, sans-serif' },
  { id: 'serif', name: 'Georgia · classic', family: 'Georgia, serif' },
  { id: 'mono', name: 'System monospace', family: 'monospace' },
] as const;
export type LabelFont = (typeof labelFonts)[number]['id'];
export function labelFontFamily(font: LabelFont): string {
  return labelFonts.find((f) => f.id === font)?.family ?? 'Arial, sans-serif';
}
