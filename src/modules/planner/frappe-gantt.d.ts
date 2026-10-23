/** The parts of Frappe Gantt the Planner uses; the package has no types of its own. */
declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string;
    name: string;
    /** YYYY-MM-DD. */
    start: string;
    /** YYYY-MM-DD, the last day included. */
    end: string;
    progress?: number;
    /** Ids of the tasks this one comes after. */
    dependencies?: string[];
    custom_class?: string;
  }
  export interface PopupContext {
    task: GanttTask;
    set_title(html: string): void;
    set_subtitle(html: string): void;
    set_details(html: string): void;
  }
  export interface GanttOptions {
    view_mode?: string;
    language?: string;
    readonly_progress?: boolean;
    today_button?: boolean;
    view_mode_select?: boolean;
    scroll_to?: string;
    bar_height?: number;
    padding?: number;
    container_height?: number | 'auto';
    popup?: (ctx: PopupContext) => void;
    on_click?: (task: GanttTask) => void;
    on_double_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
  }
  export default class Gantt {
    constructor(element: HTMLElement, tasks: GanttTask[], options?: GanttOptions);
    change_view_mode(mode: string, maintainPosition?: boolean): void;
  }
}
