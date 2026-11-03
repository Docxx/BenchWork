import { labelPack, unpackLabels } from './transfer';
import { newLabelDesign, newLabelElement, parseLabelDesign } from './model';
import { localLabelWorkspace } from './workspace';

beforeEach(() => {
  localStorage.clear();
});
it('carries folders, field values, embedded images and text styling to the phone', () => {
  const d = newLabelDesign();
  d.folder = 'Fly stocks';
  d.data = { name: 'Drosomycin-GFP' };
  const title = d.elements[0];
  if (!title) throw new Error('Missing title');
  d.elements[0] = { ...title, italic: true, underline: true, lineSpacing: 1.4 };
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  d.elements.push({ ...newLabelElement('image'), image });
  const phone = { ...newLabelDesign(), offsetY: 1.25 };
  const imported = unpackLabels(labelPack([d]), phone)[0];
  expect(imported).toMatchObject({
    folder: 'Fly stocks',
    data: { name: 'Drosomycin-GFP' },
    offsetY: 1.25,
  });
  expect(imported?.elements[0]).toMatchObject({ italic: true, underline: true, lineSpacing: 1.4 });
  expect(imported?.id).not.toBe(d.id);
  expect(imported?.elements[1]?.image).toBe(image);
});
it('preserves different paper settings and supports single legacy labels', () => {
  const d = { ...newLabelDesign(), width: 40, offsetY: -0.5 };
  expect(unpackLabels(JSON.stringify(d), { ...newLabelDesign(), offsetY: 1.25 })[0]).toMatchObject({
    width: 40,
    offsetY: -0.5,
  });
  expect(unpackLabels(labelPack([d]))[0]?.offsetY).toBe(-0.5);
  expect(() => unpackLabels('{"format":"benchwork-label-pack","version":2,"labels":[]}')).toThrow();
  expect(() => labelPack([])).toThrow();
  expect(() => labelPack(Array.from({ length: 101 }, newLabelDesign))).toThrow();
});
it('validates every label before importing any and never accepts remote images', () => {
  const d = newLabelDesign();
  expect(() =>
    unpackLabels(
      JSON.stringify({
        format: 'benchwork-label-pack',
        version: 1,
        labels: [
          d,
          { ...d, elements: [{ ...d.elements[0], image: 'https://example.com/image.png' }] },
        ],
      }),
    ),
  ).toThrow('embedded');
});
it('persists empty library folders and writes a phone pack in one storage operation', async () => {
  const workspace = localLabelWorkspace();
  await workspace.createFolder?.('Fly stocks');
  expect(await localLabelWorkspace().folders?.()).toEqual(['Fly stocks']);
  const imported = unpackLabels(labelPack([{ ...newLabelDesign(), folder: 'Fly stocks' }]));
  await workspace.saveMany?.(imported);
  expect(await workspace.list()).toHaveLength(1);
  const stored = await workspace.list();
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage full');
  });
  await expect(workspace.saveMany?.(unpackLabels(labelPack([newLabelDesign()])))).rejects.toThrow(
    'Storage full',
  );
  setter.mockRestore();
  expect(await workspace.list()).toEqual(stored);
  expect(
    parseLabelDesign({ ...newLabelDesign(), folder: 'A/B', data: { name: 'Test', unsafe: {} } }),
  ).toMatchObject({ folder: 'A B', data: { name: 'Test', unsafe: '' } });
});
