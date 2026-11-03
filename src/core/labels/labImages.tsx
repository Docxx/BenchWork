/** Offline lab artwork: original paths and the user-provided fruit-fly silhouette. */
import fruitFly from './images/fruit-fly.png?inline';
export const labImages = [
  {
    id: 'fruit-fly',
    name: 'Fruit fly',
    category: 'Biology',
    paths: [],
  },
  {
    id: 'fly-vial',
    name: 'Fly vial',
    category: 'Biology',
    paths: ['M21 10H43V17H21ZM23 17V49Q23 55 32 55Q41 55 41 49V17', 'M24 45H40M24 49H40'],
  },
  {
    id: 'dna',
    name: 'DNA helix',
    category: 'Biology',
    paths: [
      'M22 7C48 17 16 33 42 57M42 7C16 17 48 33 22 57',
      'M25 10H39M25 19H39M25 28H39M25 37H39M25 46H39M25 55H39',
    ],
  },
  {
    id: 'antibody',
    name: 'Antibody',
    category: 'Biology',
    paths: [
      'M28 54V35L12 19L18 13L32 27L46 13L52 19L36 35V54Z',
      'M11 12L17 6M18 19L24 13M40 13L46 19M47 6L53 12',
    ],
  },
  {
    id: 'pill',
    name: 'Tablet medicine',
    category: 'Medicines',
    paths: ['M10 32A22 22 0 1 0 54 32A22 22 0 1 0 10 32', 'M17 47L47 17', 'M18 25Q20 19 26 17'],
  },
  {
    id: 'capsule',
    name: 'Capsule',
    category: 'Medicines',
    paths: [
      'M15 27L27 15A15 15 0 0 1 49 37L37 49A15 15 0 0 1 15 27Z',
      'M21 21L43 43M35 16L46 27M31 20L42 31M27 24L38 35',
    ],
  },
  {
    id: 'syringe',
    name: 'Syringe',
    category: 'Medicines',
    paths: [
      'M20 11L53 44M14 17L47 50M18 15L12 21M43 46L37 52M18 21L36 39L43 32L25 14Z',
      'M36 39L27 48L23 44L32 35M25 46L11 60M26 23L30 19M31 28L35 24',
    ],
  },
  {
    id: 'flask',
    name: 'Conical flask',
    category: 'Lab',
    paths: [
      'M24 7H40M27 7V25L13 48Q10 55 18 55H46Q54 55 51 48L37 25V7',
      'M20 37H44M22 45H28M34 49H39',
      'M31 28H33',
    ],
  },
  {
    id: 'beaker',
    name: 'Beaker',
    category: 'Lab',
    paths: [
      'M15 8H49L44 15V49Q44 55 38 55H23Q17 55 17 49V8',
      'M18 33Q25 29 31 33Q38 37 44 33M35 19H43M36 26H43M36 41H43M36 48H43',
    ],
  },
  {
    id: 'tube',
    name: 'Sample tube',
    category: 'Lab',
    paths: [
      'M22 7H42V15H22ZM25 15V43L32 57L39 43V15',
      'M26 33H38M28 42H36M31 48H33M31 20H38M32 26H38',
    ],
  },
  {
    id: 'pipette',
    name: 'Pipette',
    category: 'Lab',
    paths: [
      'M40 7L55 22L48 29L33 14Z',
      'M36 17L21 32L31 42L46 27M21 32L15 45L19 49L31 42M17 47L10 54',
      'M46 13L51 8M39 20L43 24M35 24L39 28M31 28L35 32',
      'M12 55Q5 63 14 62Q18 61 12 55Z',
    ],
  },
  {
    id: 'microscope',
    name: 'Microscope',
    category: 'Lab',
    paths: [
      'M29 8L41 15L30 35L18 28Z',
      'M34 6L44 12M16 29L28 36M34 27C55 26 57 48 40 53',
      'M17 40H37M27 41V54M12 55H52V60H12ZM36 19L43 23',
    ],
  },
  {
    id: 'petri',
    name: 'Petri dish',
    category: 'Lab',
    paths: [
      'M9 29A23 13 0 1 0 55 29A23 13 0 1 0 9 29',
      'M9 29V38C9 55 55 55 55 38V29M17 29C17 18 47 18 47 29',
      'M24 28H25M35 32H36M39 25H40M28 36H29',
    ],
  },
] as const;
export function LabImage({ id }: { id: string }) {
  const image = labImages.find((i) => i.id === id);
  if (id === 'fruit-fly') return <img src={fruitFly} alt="" aria-hidden="true" />;
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {id === 'fly-vial' && <image href={fruitFly} x={24} y={25} width={16} height={11} />}
      {image?.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
export async function labImagePng(id: string): Promise<string> {
  if (id === 'fruit-fly') return fruitFly;
  const image = labImages.find((i) => i.id === id);
  if (!image) throw new Error('Unknown lab illustration.');
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 384;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Image drawing is unavailable.');
  ctx.scale(6, 6);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of image.paths) ctx.stroke(new Path2D(path));
  if (id === 'fly-vial') {
    const fly = new Image();
    fly.src = fruitFly;
    await fly.decode();
    ctx.drawImage(fly, 24, 25, 16, 11);
  }
  return c.toDataURL('image/png');
}
