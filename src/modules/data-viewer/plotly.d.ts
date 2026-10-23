/** The parts of Plotly the Data viewer uses; the package has no types of its own. */
declare module 'plotly.js-dist-min' {
  export interface PlotTrace {
    type: 'scatter' | 'bar' | 'box';
    mode?: 'markers' | 'lines' | 'lines+markers';
    name?: string;
    x?: (number | string)[];
    y: (number | string)[];
  }
  export interface PlotLayout {
    margin?: { l: number; r: number; t: number; b: number };
    xaxis?: { title?: { text: string } };
    yaxis?: { title?: { text: string } };
    showlegend?: boolean;
    paper_bgcolor?: string;
    plot_bgcolor?: string;
    font?: { color?: string };
    boxmode?: 'group';
  }
  /** Draws a plot, or updates the one already in `element`. */
  export function react(
    element: HTMLElement,
    data: PlotTrace[],
    layout?: PlotLayout,
    config?: { displaylogo?: boolean; responsive?: boolean },
  ): Promise<unknown>;
  export function purge(element: HTMLElement): void;
}
