import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Summary } from './metrics';
import { DEFAULT_RULES, type PalmRules } from './palm';
import type { RendererKind } from './render';
import { InkSurface, type SurfaceOptions, type SurfaceStatus } from './surface';
import './spike.css';

/**
 * Phase 1 spike: is pen writing in a web view fast enough? Not part of the
 * app. Open /spikes/ink/ on the dev server; see RESULTS.md for the method.
 */

const DEFAULT_OPTIONS: SurfaceOptions = {
  renderer: 'freehand',
  predicted: true,
  lowLatency: true,
  rawUpdates: false,
  rules: DEFAULT_RULES,
};

interface Snapshot {
  status: SurfaceStatus;
  inputToHandler: Summary;
  handlerToDrawn: Summary;
  inputToDrawn: Summary;
  sampleRate: Summary;
  frames: number;
  longFrames: number;
  fullRedraw: Summary;
}

function ms(value: number | null): string {
  return value === null ? '-' : value.toFixed(1);
}

function Stat({ label, summary, unit = 'ms' }: { label: string; summary: Summary; unit?: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{ms(summary.median)}</td>
      <td>{ms(summary.p95)}</td>
      <td>{ms(summary.max)}</td>
      <td>{unit}</td>
    </tr>
  );
}

function yesNo(value: boolean | null): string {
  return value === null ? '-' : value ? 'Yes' : 'No';
}

function Spike() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InkSurface | null>(null);
  const [options, setOptions] = useState<SurfaceOptions>(DEFAULT_OPTIONS);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const scroller = scrollerRef.current;
    if (!host || !scroller) return;
    const surface = new InkSurface(host, scroller, DEFAULT_OPTIONS);
    surfaceRef.current = surface;
    window.__inkSpike = surface;
    const read = () => {
      const m = surface.metrics;
      const report = surface.report() as { frames: { count: number; long: number } };
      setSnap({
        status: surface.status(),
        inputToHandler: m.inputToHandler.summary(),
        handlerToDrawn: m.handlerToDrawn.summary(),
        inputToDrawn: m.inputToDrawn.summary(),
        sampleRate: m.penSampleRate.summary(),
        frames: report.frames.count,
        longFrames: report.frames.long,
        fullRedraw: m.fullRedraw.summary(),
      });
    };
    read();
    const timer = setInterval(read, 500);
    return () => {
      clearInterval(timer);
      surface.destroy();
      surfaceRef.current = null;
      delete window.__inkSpike;
    };
  }, []);

  const update = (next: Partial<SurfaceOptions>) => {
    setOptions((o) => ({ ...o, ...next }));
    surfaceRef.current?.setOptions(next);
  };
  const updateRules = (next: Partial<PalmRules>) => {
    update({ rules: { ...options.rules, ...next } });
  };

  const exportResults = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const text = JSON.stringify(surface.report(), null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = `ink-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const status = snap?.status;
  const features = status?.features;

  return (
    <div className="spike" ref={scrollerRef}>
      <aside className="controls" aria-label="Spike controls">
        <h1>Ink spike</h1>

        <fieldset>
          <legend>Drawing</legend>
          <label>
            Line
            <select
              value={options.renderer}
              onChange={(e) => {
                update({ renderer: e.target.value as RendererKind });
              }}
            >
              <option value="freehand">perfect-freehand</option>
              <option value="simple">Simple</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.predicted}
              onChange={(e) => {
                update({ predicted: e.target.checked });
              }}
            />
            Predicted points
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.lowLatency}
              onChange={(e) => {
                update({ lowLatency: e.target.checked });
              }}
            />
            Low-latency canvas
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.rawUpdates}
              onChange={(e) => {
                update({ rawUpdates: e.target.checked });
              }}
            />
            Raw pointer updates
          </label>
        </fieldset>

        <fieldset>
          <legend>Palm rejection</legend>
          <label>
            <input
              type="checkbox"
              checked={options.rules.penOnly}
              onChange={(e) => {
                updateRules({ penOnly: e.target.checked });
              }}
            />
            Fingers scroll, never draw
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.rules.penNearbyMs !== null}
              onChange={(e) => {
                updateRules({ penNearbyMs: e.target.checked ? 500 : null });
              }}
            />
            Ignore touch near the pen (500 ms)
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.rules.maxContactPx !== null}
              onChange={(e) => {
                updateRules({ maxContactPx: e.target.checked ? 40 : null });
              }}
            />
            Ignore large touches (over 40 px)
          </label>
        </fieldset>

        <div className="buttons">
          <button type="button" onClick={() => surfaceRef.current?.loadStress(2000)}>
            Add 2,000 strokes
          </button>
          <button type="button" onClick={() => surfaceRef.current?.clear()}>
            Clear
          </button>
          <button type="button" onClick={() => surfaceRef.current?.resetStats()}>
            Reset stats
          </button>
          <button type="button" onClick={exportResults}>
            Export results
          </button>
        </div>

        {snap && status && features && (
          <>
            <table className="stats" aria-label="Latency">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Median</th>
                  <th scope="col">95%</th>
                  <th scope="col">Max</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                <Stat label="Input to code" summary={snap.inputToHandler} />
                <Stat label="Code to drawn" summary={snap.handlerToDrawn} />
                <Stat label="Input to drawn" summary={snap.inputToDrawn} />
                <Stat label="Pen samples" summary={snap.sampleRate} unit="per s" />
                <Stat label="Full redraw" summary={snap.fullRedraw} />
              </tbody>
            </table>
            <dl className="facts">
              <dt>Strokes</dt>
              <dd data-testid="stroke-count">{status.strokes}</dd>
              <dt>Ink file size</dt>
              <dd>{(status.inkBytes / 1024).toFixed(1)} KB</dd>
              <dt>Frames drawn</dt>
              <dd>
                {snap.frames} ({snap.longFrames} slow)
              </dd>
              <dt>Last pointer</dt>
              <dd>
                {status.lastPointer
                  ? `${status.lastPointer.type}, pressure ${status.lastPointer.pressure.toFixed(2)}, tilt ${String(status.lastPointer.tiltX)}/${String(status.lastPointer.tiltY)}, size ${status.lastPointer.width.toFixed(0)}x${status.lastPointer.height.toFixed(0)}`
                  : '-'}
              </dd>
              <dt>Palm rejection</dt>
              <dd data-testid="last-rejection">{status.lastRejection ?? '-'}</dd>
              <dt>Secure page</dt>
              <dd>{yesNo(features.secureContext)}</dd>
              <dt>Coalesced points</dt>
              <dd>{yesNo(features.coalescedEvents)}</dd>
              <dt>Predicted points</dt>
              <dd>{yesNo(features.predictedEvents)}</dd>
              <dt>Raw updates</dt>
              <dd>{yesNo(features.rawUpdate)}</dd>
              <dt>Low-latency canvas</dt>
              <dd>{yesNo(features.desynchronized)}</dd>
            </dl>
          </>
        )}
      </aside>

      <main className="page">
        <h2>Bench notes, 22 October</h2>
        <p>
          This text stands in for a document page. Write in the box below with the pen. Drag with a
          finger to scroll the page. Rest your hand on the screen as you would on paper.
        </p>
        <div className="ink-area" ref={hostRef} aria-label="Ink area" role="img" />
        <p>
          Text after the ink block. Scroll down and back while writing to check that the page and
          the ink stay in step.
        </p>
        <div className="filler" aria-hidden="true" />
      </main>
    </div>
  );
}

declare global {
  interface Window {
    /** The spike's surface, for Playwright and the browser console. */
    __inkSpike?: InkSurface;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <Spike />
  </StrictMode>,
);
