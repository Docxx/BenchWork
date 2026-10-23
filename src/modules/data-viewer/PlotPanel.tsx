import { useEffect, useRef, useState } from 'react';
import type { CellValue } from './formula';
import { columnLabel, plotTraces, type ChartType } from './plot';

/** A quick plot of the sheet's columns. Plotly is loaded only when a plot is first shown. */
export function PlotPanel({
  values,
  headings,
  columns,
}: {
  values: CellValue[][];
  headings: boolean;
  columns: number;
}) {
  const [type, setType] = useState<ChartType>('scatter');
  const [x, setX] = useState(0);
  const [y, setY] = useState(Math.min(1, columns - 1));
  const [group, setGroup] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  // Plotly is loaded once, when the panel first opens.
  const [plotly, setPlotly] = useState<typeof import('plotly.js-dist-min') | null>(null);
  useEffect(() => {
    let current = true;
    import('plotly.js-dist-min')
      .then((loaded) => {
        if (current) setPlotly(loaded);
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
    };
  }, []);

  // Redrawn in place on each change, so draws never overlap.
  useEffect(() => {
    const element = area.current;
    if (!element || plotly === null) return;
    const traces = plotTraces(values, { type, x, y, group, headings });
    plotly
      .react(
        element,
        traces,
        {
          margin: { l: 50, r: 20, t: 20, b: 50 },
          xaxis: { title: { text: type === 'box' ? '' : columnLabel(values, x, headings) } },
          yaxis: { title: { text: columnLabel(values, y, headings) } },
          showlegend: group !== null,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: getComputedStyle(element).color },
          boxmode: 'group',
        },
        { displaylogo: false, responsive: true },
      )
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : String(err));
      });
  }, [plotly, values, type, x, y, group, headings]);

  useEffect(() => {
    const element = area.current;
    return () => {
      if (element && plotly !== null) plotly.purge(element);
    };
  }, [plotly]);

  const options = Array.from({ length: columns }, (_, c) => (
    <option key={c} value={c}>
      {columnLabel(values, c, headings)}
    </option>
  ));

  return (
    <section className="plot-panel" aria-label="Plot">
      <div className="plot-controls">
        <label>
          Chart
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as ChartType);
            }}
          >
            <option value="scatter">Scatter</option>
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="box">Box</option>
          </select>
        </label>
        {type !== 'box' && (
          <label>
            X
            <select
              value={x}
              onChange={(e) => {
                setX(Number(e.target.value));
              }}
            >
              {options}
            </select>
          </label>
        )}
        <label>
          Y
          <select
            value={y}
            onChange={(e) => {
              setY(Number(e.target.value));
            }}
          >
            {options}
          </select>
        </label>
        <label>
          Group by
          <select
            value={group ?? ''}
            onChange={(e) => {
              setGroup(e.target.value === '' ? null : Number(e.target.value));
            }}
          >
            <option value="">None</option>
            {options}
          </select>
        </label>
      </div>
      {problem !== null && <p className="notice">The plot could not be drawn. {problem}</p>}
      <div ref={area} className="plot-area" />
    </section>
  );
}
