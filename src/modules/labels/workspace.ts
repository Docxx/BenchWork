import {
  parseLabelDesign,
  labelFolder,
  type ModuleContext,
  type LabelWorkspace,
  type LabelRow,
} from '@core/api';
export function labelWorkspace(ctx: ModuleContext): LabelWorkspace {
  return {
    list: async () => {
      if (!(await ctx.vault.exists('Labels'))) return [];
      const entries = await ctx.vault.listDir('Labels');
      return Promise.all(
        entries
          .filter((e) => !e.isDir && e.name.endsWith('.label.json'))
          .slice(0, 2000)
          .map(async (e) =>
            parseLabelDesign(JSON.parse(await ctx.vault.readText(`Labels/${e.name}`))),
          ),
      );
    },
    save: async (d) => {
      await ctx.vault.ensureDir('Labels');
      const validated = parseLabelDesign(d);
      const path = `Labels/${validated.id}.label.json`;
      if (await ctx.vault.exists(path)) await ctx.vault.keepSnapshot(path);
      await ctx.vault.writeText(path, JSON.stringify(validated, null, 2));
    },
    folders: async () => {
      const path = 'Labels/folders.json';
      if (!(await ctx.vault.exists(path))) return [];
      const raw: unknown = JSON.parse(await ctx.vault.readText(path));
      return Array.isArray(raw)
        ? raw
            .filter((v): v is string => typeof v === 'string')
            .map(labelFolder)
            .filter(Boolean)
        : [];
    },
    createFolder: async (name) => {
      await ctx.vault.ensureDir('Labels');
      const path = 'Labels/folders.json';
      const folders = (await labelWorkspace(ctx).folders?.()) ?? [];
      if (await ctx.vault.exists(path)) await ctx.vault.keepSnapshot(path);
      await ctx.vault.writeText(
        path,
        JSON.stringify([...new Set([...folders, labelFolder(name)])].filter(Boolean), null, 2),
      );
    },
    records: async () => {
      const items = (await ctx.app.items())
        .filter((i) =>
          ['sample', 'reagent', 'antibody', 'stock', 'dataset', 'experiment', 'fly-stock'].includes(
            i.type,
          ),
        )
        .slice(0, 500);
      return Promise.all(
        items.map(async (item) => {
          const record = item.path.endsWith('.yaml')
            ? await ctx.vault.readRecord(item.path)
            : { data: {}, error: null };
          if (record.error) throw new Error(record.error);
          const flat = Object.fromEntries(
            Object.entries(record.data)
              .filter(
                ([key, value]) =>
                  !['path', 'source', 'storagePath'].includes(key) &&
                  ['string', 'number', 'boolean'].includes(typeof value),
              )
              .map(([k, v]) => [k, String(v)]),
          );
          return {
            ...flat,
            name: item.title,
            id: flat['id'] ?? item.title,
            type: item.type,
            date: new Date().toLocaleDateString('en-GB'),
          } satisfies LabelRow;
        }),
      );
    },
  };
}
