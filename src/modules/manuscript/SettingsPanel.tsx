import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { readSettings, saveSettings } from './manuscripts';

/** Settings > Modules > Manuscript: whether Pandoc is there, and the citation style. */
export function ManuscriptSettings({ ctx }: { ctx: ModuleContext }) {
  const [pandoc, setPandoc] = useState<string | null | undefined>(undefined);
  const [style, setStyle] = useState<string | null>(null);

  // Bumped by Check again, to look for Pandoc once more.
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    let current = true;
    void ctx.pandoc.version().then((v) => {
      if (current) setPandoc(v);
    });
    return () => {
      current = false;
    };
  }, [ctx, checks]);

  useEffect(() => {
    let current = true;
    void readSettings(ctx).then((s) => {
      if (current) setStyle(s.style);
    });
    return () => {
      current = false;
    };
  }, [ctx]);

  const check = () => {
    setPandoc(undefined);
    setChecks((n) => n + 1);
  };

  const chooseStyle = async () => {
    const [picked] = await ctx.vault.pickFiles({
      title: 'Choose a citation style (.csl file)',
      multiple: false,
    });
    if (picked === undefined) return;
    const path = ctx.vault.vaultPathOf(picked);
    if (path === null || !path.toLowerCase().endsWith('.csl')) {
      ctx.app.notify('Choose a .csl file inside the vault.');
      return;
    }
    await saveSettings(ctx, { style: path });
    setStyle(path);
  };

  const resetStyle = async () => {
    await saveSettings(ctx, { style: null });
    setStyle(null);
  };

  return (
    <div className="manuscript-settings">
      <p role="status">
        {pandoc === undefined && 'Looking for Pandoc…'}
        {pandoc === null && 'Pandoc is not installed, so manuscripts cannot be exported yet.'}
        {typeof pandoc === 'string' && `Pandoc ${pandoc} is installed.`}
      </p>
      {pandoc === null && (
        <p className="hint">
          Install it with winget install JohnMacFarlane.Pandoc, restart BenchWork, then check again.
        </p>
      )}
      <button type="button" className="quiet" onClick={check}>
        Check again
      </button>

      <p>
        Citation style:{' '}
        {style === null ? (
          'Chicago author-date (Pandoc’s own)'
        ) : (
          <span className="path">{style}</span>
        )}
      </p>
      <div className="actions">
        <button type="button" onClick={() => void chooseStyle()}>
          Choose style file
        </button>
        {style !== null && (
          <button type="button" className="quiet" onClick={() => void resetStyle()}>
            Use Chicago author-date
          </button>
        )}
      </div>
      <p className="hint">
        Styles such as APA or a journal’s own come from the Zotero Style Repository as .csl files.
        Save one in the vault, then choose it here. A manuscript’s Citation style property can name
        another.
      </p>
    </div>
  );
}
