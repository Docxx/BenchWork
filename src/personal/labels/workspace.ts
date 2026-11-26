import {
  appLink,
  isShortCode,
  newShortCode,
  parseLabelDesign,
  labelFolder,
  type ModuleContext,
  type LabelWorkspace,
  type LabelRow,
  type LabelDesign,
} from '@core/api';
/** Fly stocks: the record types a QR code on a label can open. */
const STOCK_TYPES = ['flystock', 'fly-stock'];

/**
 * Labels reach the phone through the relay, so there is no pack to export and
 * share. A phone that has not been connected, or a relay that is not
 * answering, simply misses this one: the label is saved in the vault either way.
 */
async function sendLabel(ctx: ModuleContext, design: LabelDesign): Promise<void> {
  if (!ctx.cards.available() || design.savedAs === 'printed') return;
  try {
    await ctx.cards.put('label', design.id, design);
  } catch (err) {
    console.warn('[labels] This label could not be sent to the phone', design.name, err);
  }
}

async function dropLabel(ctx: ModuleContext, id: string): Promise<void> {
  if (!ctx.cards.available()) return;
  try {
    await ctx.cards.remove('label', id);
  } catch (err) {
    console.warn('[labels] This label could not be taken off the phone', id, err);
  }
}

const SENT = 'sent-to-phone';

/**
 * Labels saved before the phone was connected, or made by Fly room, have
 * never been sent. Whenever the library is read, anything the phone has not
 * had yet goes across. What has gone is remembered in the module's own
 * folder, so this costs one relay call per new or changed label.
 */
async function catchUp(ctx: ModuleContext, designs: readonly LabelDesign[]): Promise<void> {
  if (!ctx.cards.available()) return;
  try {
    const raw = await ctx.storage.read(SENT).catch(() => null);
    const sent: Record<string, string> =
      raw !== null && typeof raw === 'object' ? (raw as Record<string, string>) : {};
    let changed = false;
    for (const design of designs) {
      if (design.savedAs === 'printed') continue;
      const mark = design.savedAt ?? '';
      if (sent[design.id] === mark) continue;
      await ctx.cards.put('label', design.id, design);
      sent[design.id] = mark;
      changed = true;
    }
    if (changed) await ctx.storage.write(SENT, sent);
  } catch (err) {
    console.warn('[labels] Labels could not be caught up on the phone', err);
  }
}

export function labelWorkspace(ctx: ModuleContext): LabelWorkspace {
  /**
   * A fly stock's short code for `{code}` and `{link}`, given once and kept in
   * its record as `code:` so labels already printed keep working.
   */
  const stockCode = async (path: string, type: string, current: unknown) => {
    if (!STOCK_TYPES.includes(type) || !path.endsWith('.yaml')) return null;
    if (typeof current === 'string' && isShortCode(current)) return current;
    if (current !== undefined && current !== null && current !== '') return null;
    const code = newShortCode();
    await ctx.vault.updateRecord(path, { code });
    return code;
  };

  return {
    list: async () => {
      if (!(await ctx.vault.exists('Labels'))) return [];
      const entries = await ctx.vault.listDir('Labels');
      const designs = await Promise.all(
        entries
          .filter((e) => !e.isDir && e.name.endsWith('.label.json'))
          .slice(0, 2000)
          .map(async (e) =>
            parseLabelDesign(JSON.parse(await ctx.vault.readText(`Labels/${e.name}`))),
          ),
      );
      void catchUp(ctx, designs);
      return designs;
    },
    save: async (d) => {
      await ctx.vault.ensureDir('Labels');
      const validated = parseLabelDesign(d);
      const path = `Labels/${validated.id}.label.json`;
      if (await ctx.vault.exists(path)) await ctx.vault.keepSnapshot(path);
      await ctx.vault.writeText(path, JSON.stringify(validated, null, 2));
      await sendLabel(ctx, validated);
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
    remove: async (design) => {
      const path = `Labels/${design.id}.label.json`;
      const gone = (await ctx.vault.exists(path))
        ? await ctx.app.askToRecycle({ path, name: `${design.name} label` })
        : true;
      if (gone) await dropLabel(ctx, design.id);
      return gone;
    },
    records: async () => {
      const items = (await ctx.app.items())
        .filter((i) =>
          [
            'sample',
            'reagent',
            'antibody',
            'stock',
            'dataset',
            'experiment',
            'fly-stock',
            'flystock',
            'flycross',
          ].includes(i.type),
        )
        .slice(0, 500);
      return Promise.all(
        items.map(async (item) => {
          const record = item.path.endsWith('.yaml')
            ? await ctx.vault.readRecord(item.path)
            : { data: {}, error: null };
          if (record.error) throw new Error(record.error);
          const code = await stockCode(item.path, item.type, record.data['code']);
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
            ...(code ? { code, link: appLink('s', code) } : {}),
            date: new Date().toLocaleDateString('en-GB'),
          } satisfies LabelRow;
        }),
      );
    },
  };
}
