import { useState, useRef } from 'react';
import type { ModuleContext } from '@core/api';
import type { BranchOutline } from '../mind-maps/branchOutline';

const filename = (title: string) =>
  title
    .replace(/[<>:"/\\|?*#\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/, '') || 'Section';

export function OutlineBuilder({ ctx, outline }: { ctx: ModuleContext; outline: BranchOutline }) {
  const [sections, setSections] = useState(outline.sections);
  const [title, setTitle] = useState(outline.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const created = useRef(new Map<string, string>());
  const manuscript = useRef('');
  function move(index: number, offset: number) {
    const ordered = [...sections];
    const [part] = ordered.splice(index, 1);
    if (part) {
      ordered.splice(index + offset, 0, part);
      setSections(ordered);
    }
  }
  async function build() {
    setBusy(true);
    setError('');
    try {
      await ctx.vault.ensureDir('Writing/Sections');
      const links: string[] = [];
      for (const part of sections) {
        let path = created.current.get(part.id);
        if (!path) {
          const base = (
            await ctx.vault.freeName('Writing/Sections', filename(part.title), '.md')
          ).slice(0, -3);
          path =
            (await ctx.app.createPage(
              'Writing/Sections',
              base,
              'writing-section',
              {
                properties: {
                  status: 'planned',
                  evidence: part.evidence.map((p) => '[[' + p + ']]'),
                },
                body: '# ' + part.title + '\n\n',
              },
              { background: true },
            )) ?? undefined;
          if (!path) throw new Error('Could not create section ' + part.title + '.');
          created.current.set(part.id, path);
        }
        links.push('- [[' + path + ']]');
      }
      if (!manuscript.current) {
        const base = (await ctx.vault.freeName('Writing', filename(title), '.md')).slice(0, -3);
        manuscript.current =
          (await ctx.app.createPage(
            'Writing',
            base,
            'manuscript',
            {
              properties: { manuscriptKind: 'paper' },
              body: '# ' + title + '\n\n' + links.join('\n') + '\n',
            },
            { background: true },
          )) ?? '';
        if (!manuscript.current) throw new Error('Could not create the manuscript.');
      }
      await ctx.app.openView('references.writing', manuscript.current);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy}>
      <legend>Writing outline</legend>
      <label>
        Manuscript title{' '}
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <ol>
        {sections.map((s, i) => (
          <li key={s.id}>
            <strong>{s.title}</strong> · {s.evidence.length} linked evidence notes{' '}
            <button
              disabled={!i}
              onClick={() => {
                move(i, -1);
              }}
              aria-label={'Move ' + s.title + ' up'}
            >
              ↑
            </button>
            <button
              disabled={i === sections.length - 1}
              onClick={() => {
                move(i, 1);
              }}
              aria-label={'Move ' + s.title + ' down'}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button disabled={!title.trim() || !sections.length} onClick={() => void build()}>
        Create manuscript outline
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
