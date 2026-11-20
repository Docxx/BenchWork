import { FigureImage as EvidenceFigure } from '../references/FigureImage';
import { branchOutline } from './branchOutline';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { NoteText, NoteTextEditor, plainTextToMarkdown, type ModuleContext } from '@core/api';
import {
  DEFAULT_SIZE,
  isFormatted,
  kindForPath,
  MARKDOWN_FORMAT,
  newId,
  parseCanvas,
  serialiseCanvas,
  type CanvasDoc,
  type CanvasItem,
  type CanvasLink,
  type KnownKind,
} from './canvasFile';
import { MapBackground } from './MapBackground';
import { CanvasSearch, type BoardMatch } from './CanvasSearch';
import { captureScreen, imageExtensions } from './captureScreen';
import { plainText } from './outline';
import { CanvasStyleBar } from './CanvasStyleBar';
import {
  ARROW_DEFAULTS,
  arrowLook,
  CARD_DEFAULTS,
  cardClass,
  cardLook,
  cardStyle,
  colourVar,
  edgeLook,
  SEE_THROUGH,
  SIDES,
  withLook,
  type ArrowLook,
  type CardLook,
} from './canvasStyle';

/** The usual furthest zoom; a canvas too big to see whole at it may go further. */
export const USUAL_MIN_ZOOM = 0.1;
/** Never further than this, however big the canvas. */
const FURTHEST_ZOOM = 0.002;
/** Below this zoom, small and normal words are too small to read, so they are not drawn. */
export const FAR_ZOOM = 0.1;
/** Below this zoom, large and huge words go too, and cards show as plain blocks. */
export const FARTHER_ZOOM = 0.04;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box around all the items, or null for an empty canvas. */
export function boundsOf(items: readonly Box[]): Box | null {
  if (items.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of items) {
    x0 = Math.min(x0, i.x);
    y0 = Math.min(y0, i.y);
    x1 = Math.max(x1, i.x + i.width);
    y1 = Math.max(y1, i.y + i.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * How far out the canvas may zoom: the usual limit, or far enough to see the
 * whole canvas in `view` with room to spare.
 */
export function minZoomFor(bounds: Box | null, view: { width: number; height: number }): number {
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) return USUAL_MIN_ZOOM;
  const fit = Math.min(view.width / bounds.width, view.height / bounds.height);
  return Math.max(FURTHEST_ZOOM, Math.min(USUAL_MIN_ZOOM, fit / 2));
}

/** Saves this long after the last change. */
export const CANVAS_SAVE_MS = 800;
/** Changes reported this soon after our own save are our own. */
const OWN_SAVE_MS = 2000;

type CardData = { item: CanvasItem };
type CardNode = Node<CardData>;
type ArrowEdge = Edge<{ link: CanvasLink }>;

interface CanvasActions {
  ctx: ModuleContext;
  setText: (id: string, text: string) => void;
}

/** Opens what a card links to: a web address in the browser, or a vault page. */
function openLink(ctx: ModuleContext, link: string): void {
  if (/^https?:\/\//i.test(link)) void ctx.web.open(link);
  else void ctx.app.open(link);
}

/** What a card's link shows: a site and path, or a page's name. */
function linkName(link: string): string {
  return /^https?:/i.test(link)
    ? link.replace(/^https?:\/\/(www\.)?/i, '')
    : (link.split('/').at(-1) ?? link).replace(/\.md$/i, '');
}
const Actions = createContext<CanvasActions | null>(null);
function useActions(): CanvasActions {
  // Read in cards, which only ever render inside the provider.
  const value = useContext(Actions);
  if (value === null) throw new Error('Canvas card outside a canvas');
  return value;
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function toNode(item: CanvasItem): CardNode {
  const type = (['text', 'page', 'image', 'file'] as string[]).includes(item.kind)
    ? item.kind
    : 'unknown';
  return {
    id: item.id,
    type,
    position: { x: item.x, y: item.y },
    width: item.width,
    height: item.height,
    data: { item },
  };
}

function toEdge(link: CanvasLink): ArrowEdge {
  const look = edgeLook(arrowLook(link));
  const marker = {
    type: MarkerType.ArrowClosed,
    ...(look.colour === undefined ? {} : { color: look.colour }),
  };
  return {
    id: link.id,
    source: link.from,
    target: link.to,
    type: look.type,
    style: look.style,
    ...(typeof link.label === 'string' && link.label !== '' ? { label: link.label } : {}),
    ...(look.head ? { markerEnd: marker } : {}),
    ...(look.tail ? { markerStart: marker } : {}),
    data: { link },
  };
}

/** An arrow's link as it now stands, with the label it was given here. */
function linkOf(edge: ArrowEdge): CanvasLink {
  const link: CanvasLink = { ...edge.data?.link, id: edge.id, from: edge.source, to: edge.target };
  if (typeof edge.label === 'string' && edge.label !== '') link.label = edge.label;
  else delete link.label;
  return link;
}

/** The canvas as it now stands, keeping anything it does not know about. */
function toDoc(base: CanvasDoc, nodes: CardNode[], edges: ArrowEdge[]): CanvasDoc {
  return {
    ...base,
    items: nodes.map((n) => ({
      ...n.data.item,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(n.width ?? n.data.item.width),
      height: Math.round(n.height ?? n.data.item.height),
    })),
    links: edges.map(linkOf),
  };
}

/** Which sides of two cards an arrow joins: the ones facing each other. */
export function facingSides(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
): { source: string; target: string } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

/** Arrows drawn between the facing sides of their cards, wherever the cards are. */
function routed(edges: ArrowEdge[], nodes: CardNode[]): ArrowEdge[] {
  const box = new Map(
    nodes.map((n) => [
      n.id,
      {
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? n.data.item.width,
        height: n.height ?? n.data.item.height,
      },
    ]),
  );
  return edges.map((e) => {
    const from = box.get(e.source);
    const to = box.get(e.target);
    if (!from || !to) return e;
    // Sides chosen when the arrow was drawn stay; otherwise the facing ones.
    const facing = facingSides(from, to);
    const look = e.data ? arrowLook(e.data.link) : null;
    return {
      ...e,
      sourceHandle: look?.fromSide ?? facing.source,
      targetHandle: look?.toSide ?? facing.target,
    };
  });
}

/** Connection points on all four sides; any can start or end an arrow. */
function Handles() {
  return (
    <>
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
    </>
  );
}

/** A card's outline, shape, colours and link, around what it shows. */
function CardFrame({
  item,
  kind,
  selected,
  min,
  title,
  onDoubleClick,
  children,
}: {
  item: CanvasItem;
  kind: string;
  selected: boolean;
  min: { width: number; height: number };
  title?: string;
  onDoubleClick?: () => void;
  children: ReactNode;
}) {
  const { ctx } = useActions();
  const look = cardLook(item);
  const link = look.link;
  return (
    <div
      className={cardClass(look, kind)}
      style={cardStyle(look)}
      title={title}
      onDoubleClick={onDoubleClick}
    >
      {look.shape === 'diamond' && (
        <svg className="card-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <NodeResizer isVisible={selected} minWidth={min.width} minHeight={min.height} />
      <Handles />
      {children}
      {typeof item['source'] === 'string' && typeof item['heading'] === 'string' && (
        <button
          type="button"
          className="nodrag"
          onDoubleClick={(e) => {
            e.stopPropagation();
          }}
          onClick={() =>
            void ctx.app.open(String(item['source']), { heading: String(item['heading']) })
          }
        >
          Open PDF · p. {item['heading'].slice(5).split('&')[0]}
        </button>
      )}
      {link !== null && (
        <button
          type="button"
          className="card-link nodrag"
          title={`Open ${link}`}
          onClick={() => {
            openLink(ctx, link);
          }}
        >
          {`\u2197 ${linkName(link)}`}
        </button>
      )}
    </div>
  );
}

function TextCard({ id, data, selected }: NodeProps<CardNode>) {
  const { ctx, setText } = useActions();
  const text = data.item.text ?? '';
  const formatted = isFormatted(data.item);
  const [editing, setEditing] = useState(text === '');
  // Plain cards from before formatting become formatted the first time they are changed.
  const markdown = formatted ? text : plainTextToMarkdown(text);
  return (
    <CardFrame
      item={data.item}
      kind="text-card"
      selected={selected}
      min={{ width: 80, height: 40 }}
      onDoubleClick={() => {
        setEditing(true);
      }}
    >
      {editing ? (
        <NoteTextEditor
          markdown={markdown}
          label="Card text"
          onDone={(next) => {
            setEditing(false);
            if (next !== markdown || (!formatted && text === '')) setText(id, next);
          }}
        />
      ) : text === '' ? (
        <p className="card-text">Double-click to write</p>
      ) : formatted ? (
        <NoteText
          className="card-text"
          markdown={text}
          onOpenLink={(url) => {
            openLink(ctx, url);
          }}
        />
      ) : (
        <p className="card-text">{text}</p>
      )}
    </CardFrame>
  );
}

function PageCard({ data, selected }: NodeProps<CardNode>) {
  const { ctx } = useActions();
  const path = data.item.path ?? '';
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    ctx.vault
      .readText(path)
      .then((text) => {
        const body = text.replace(/^---[\s\S]*?\n---[ \t]*\r?\n/, '');
        const lines = body
          .split(/\r?\n/)
          .map((l) => plainText(l.replace(/^#+\s+|^\s*[-*+]\s+/, '')))
          .filter((l) => l !== '');
        if (current) setPreview(lines.slice(0, 6).join(' · '));
      })
      .catch(() => {
        if (current) setPreview(null);
      });
    return () => {
      current = false;
    };
  }, [ctx, path]);
  return (
    <CardFrame
      item={data.item}
      kind="page-card"
      selected={selected}
      min={{ width: 120, height: 50 }}
      title="Double-click to open"
      onDoubleClick={() => void ctx.app.open(path)}
    >
      <strong className="card-title">{fileName(path).replace(/\.md$/i, '')}</strong>
      {typeof data.item['evidence'] === 'string' ? (
        <>
          <p className="card-preview">
            {typeof data.item['excerpt'] === 'string' ? data.item['excerpt'] : ''}
          </p>
          {Boolean(data.item['figure']) && (
            <EvidenceFigure ctx={ctx} path={String(data.item['figure'])} />
          )}
          <small>{typeof data.item['citation'] === 'string' ? data.item['citation'] : ''}</small>
          <p className="card-preview">
            {typeof data.item['comment'] === 'string' ? data.item['comment'] : ''}
          </p>
        </>
      ) : (
        <p className="card-preview">{preview ?? 'This page could not be found.'}</p>
      )}
    </CardFrame>
  );
}

function ImageCard({ data, selected }: NodeProps<CardNode>) {
  const { ctx } = useActions();
  const path = data.item.path ?? '';
  // Keep one source while dragging or resizing. Browser-backed vaults allocate
  // a fresh blob URL on every call to fileUrl.
  const showImage = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return;
      const url = ctx.vault.fileUrl(path);
      if (url === null) {
        image.alt = fileName(path) + ' could not be found.';
        return;
      }
      image.src = url;
      return () => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      };
    },
    [ctx, path],
  );
  return (
    <CardFrame
      item={data.item}
      kind="image-card"
      selected={selected}
      min={{ width: 60, height: 40 }}
      title="Double-click to open"
      onDoubleClick={() => void ctx.app.open(path)}
    >
      <img ref={showImage} alt={fileName(path)} draggable={false} />
    </CardFrame>
  );
}

function FileCard({ data, selected }: NodeProps<CardNode>) {
  const { ctx } = useActions();
  const path = data.item.path ?? '';
  return (
    <CardFrame
      item={data.item}
      kind="file-card"
      selected={selected}
      min={{ width: 120, height: 40 }}
      title="Double-click to open"
      onDoubleClick={() => void ctx.app.open(path)}
    >
      <strong className="card-title">{fileName(path)}</strong>
      <p className="card-preview">{path}</p>
    </CardFrame>
  );
}

/** An item from a module that is switched off, such as ink. Kept, not shown. */
function UnknownCard({ data }: NodeProps<CardNode>) {
  return (
    <div className="canvas-card unknown-card">
      <Handles />
      <p className="card-preview">
        This {data.item.kind} item needs a module that is switched off. It is kept as it is.
      </p>
    </div>
  );
}

const NODE_TYPES = {
  text: TextCard,
  page: PageCard,
  image: ImageCard,
  file: FileCard,
  unknown: UnknownCard,
};

/** A `.canvas.json` file: cards and arrows on a free surface. */
export default function CanvasEditor({ ctx, path }: { ctx: ModuleContext; path: string }) {
  return (
    <ReactFlowProvider>
      <Board key={path} ctx={ctx} path={path} />
    </ReactFlowProvider>
  );
}

function Board({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const flow = useReactFlow<CardNode, ArrowEdge>();
  const [nodes, setNodes] = useState<CardNode[]>([]);
  const [edges, setEdges] = useState<ArrowEdge[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [reads, setReads] = useState(0);
  /** How far out the view is: near, far (small words hidden) or farther (all words hidden). */
  const [distance, setDistance] = useState<'near' | 'far' | 'farther'>('near');
  /** Whether the overview map shows; null until chosen, when it shows for big canvases. */
  const [overview, setOverview] = useState<boolean | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [batch, setBatch] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const board = useRef<HTMLDivElement>(null);

  const base = useRef<CanvasDoc | null>(null);
  const latest = useRef<{ nodes: CardNode[]; edges: ArrowEdge[] }>({ nodes: [], edges: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const blocked = useRef(false);
  const snapshotTaken = useRef(false);
  const lastSave = useRef(0);

  useEffect(() => {
    let current = true;
    ctx.vault
      .readText(path)
      .then((text) => {
        if (!current) return;
        const doc = parseCanvas(text);
        base.current = doc;
        const colour = doc['background'];
        setBackground(typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null);
        const next = { nodes: doc.items.map(toNode), edges: doc.links.map(toEdge) };
        latest.current = next;
        setNodes(next.nodes);
        setEdges(next.edges);
        setProblem(null);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
    };
  }, [ctx, path, reads]);

  const save = useCallback(async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const doc = base.current;
    if (doc === null || blocked.current) return;
    const state = latest.current;
    try {
      if (!snapshotTaken.current) {
        await ctx.vault.keepSnapshot(path).catch(() => undefined);
        snapshotTaken.current = true;
      }
      lastSave.current = Date.now();
      await ctx.vault.writeText(path, serialiseCanvas(toDoc(doc, state.nodes, state.edges)));
      dirty.current = latest.current !== state;
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [ctx, path]);

  const changed = useCallback(
    (next: { nodes: CardNode[]; edges: ArrowEdge[] }) => {
      latest.current = next;
      dirty.current = true;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), CANVAS_SAVE_MS);
    },
    [save],
  );

  // Outside changes are read again, unless there are edits here: then the user chooses.
  useEffect(() => {
    const watching = ctx.vault.watch((change) => {
      if (!change.paths.includes(path) || Date.now() - lastSave.current < OWN_SAVE_MS) return;
      if (dirty.current) {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        blocked.current = true;
        setChangedElsewhere(true);
      } else setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx, path]);

  // Save before leaving the canvas.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(
    () => () => {
      if (timer.current !== null) void saveRef.current();
    },
    [],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) => {
      const next = applyNodeChanges(changes, latest.current.nodes);
      setNodes(next);
      // Moving, resizing and deleting change the file; selecting and measuring do not.
      const real = changes.some(
        (c) =>
          (c.type === 'position' && c.dragging === false) ||
          (c.type === 'dimensions' && c.resizing === false) ||
          c.type === 'remove',
      );
      if (real) changed({ ...latest.current, nodes: next });
      else latest.current = { ...latest.current, nodes: next };
    },
    [changed],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ArrowEdge>[]) => {
      const next = applyEdgeChanges(changes, latest.current.edges);
      setEdges(next);
      if (changes.some((c) => c.type === 'remove')) changed({ ...latest.current, edges: next });
      else latest.current = { ...latest.current, edges: next };
    },
    [changed],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      // Drawn from one dot to another, the arrow keeps to those sides.
      const isSide = (h: string | null | undefined): h is (typeof SIDES)[number] =>
        typeof h === 'string' && (SIDES as readonly string[]).includes(h);
      const link: CanvasLink = { id: newId(), from: connection.source, to: connection.target };
      if (isSide(connection.sourceHandle) && isSide(connection.targetHandle)) {
        link['fromSide'] = connection.sourceHandle;
        link['toSide'] = connection.targetHandle;
      }
      const next = addEdge(toEdge(link), latest.current.edges);
      setEdges(next);
      changed({ ...latest.current, edges: next });
    },
    [changed],
  );

  // An arrow dropped anywhere on a card, not just on one of its dots, joins it.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const from = state.fromNode?.id;
      if (state.isValid === true || from === undefined) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;
      const card = document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest('.react-flow__node')
        ?.getAttribute('data-id');
      if (card) onConnect({ source: from, target: card, sourceHandle: null, targetHandle: null });
    },
    [onConnect],
  );

  const setText = useCallback(
    (id: string, text: string) => {
      const next = latest.current.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { item: { ...n.data.item, text, format: MARKDOWN_FORMAT } } }
          : n,
      );
      setNodes(next);
      changed({ ...latest.current, nodes: next });
    },
    [changed],
  );

  /** Changes the look of the selected cards. */
  const restyleCards = (changes: Partial<CardLook>) => {
    const next = latest.current.nodes.map((n) =>
      n.selected === true
        ? { ...n, data: { item: withLook(n.data.item, changes, CARD_DEFAULTS) } }
        : n,
    );
    setNodes(next);
    changed({ ...latest.current, nodes: next });
  };

  /** Changes the selected arrows' links, drawing them afresh. */
  const relink = (change: (link: CanvasLink) => CanvasLink) => {
    const next = latest.current.edges.map((e) =>
      e.selected === true ? { ...toEdge(change(linkOf(e))), selected: true } : e,
    );
    setEdges(next);
    changed({ ...latest.current, edges: next });
  };

  const restyleArrows = (changes: Partial<ArrowLook>) => {
    relink((link) => withLook(link, changes, ARROW_DEFAULTS));
  };

  const reverseArrows = () => {
    relink((link) => {
      const look = arrowLook(link);
      return withLook(
        { ...link, from: link.to, to: link.from },
        { fromSide: look.toSide, toSide: look.fromSide },
        ARROW_DEFAULTS,
      );
    });
  };

  const nameArrow = (edge: ArrowEdge) => {
    void ctx.app
      .askText({
        title: 'Name the arrow',
        label: 'Arrow label',
        initial: typeof edge.label === 'string' ? edge.label : '',
      })
      .then((label) => {
        if (label === null) return;
        const next = latest.current.edges.map((e) =>
          e.id === edge.id ? { ...e, label: label.trim() } : e,
        );
        setEdges(next);
        changed({ ...latest.current, edges: next });
      });
  };

  const linkCard = async (node: CardNode) => {
    const current = cardLook(node.data.item).link;
    const answer = await ctx.app.askText({
      title: 'Link the card',
      label: 'Page name or web address (empty for none)',
      initial: current ?? '',
    });
    if (answer === null) return;
    const wanted = answer.trim();
    let link: string | null = null;
    if (/^https?:\/\//i.test(wanted)) link = wanted;
    else if (wanted !== '') {
      link = await ctx.app.resolveLink(wanted, path);
      if (link === null) {
        ctx.app.notify(`No page called "${wanted}" was found.`);
        return;
      }
    }
    const next = latest.current.nodes.map((n) =>
      n.id === node.id
        ? { ...n, data: { item: withLook(n.data.item, { link }, CARD_DEFAULTS) } }
        : n,
    );
    setNodes(next);
    changed({ ...latest.current, nodes: next });
  };

  /** Adds a card in the middle of the view, or at `at`. */
  const add = (kind: KnownKind, fields: Partial<CanvasItem>, at?: { x: number; y: number }) => {
    const rect = board.current?.getBoundingClientRect();
    const size = {
      width: fields.width ?? DEFAULT_SIZE[kind].width,
      height: fields.height ?? DEFAULT_SIZE[kind].height,
    };
    const centre =
      at ??
      flow.screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
      });
    // Stepped down and right until it covers no other card.
    const covers = (x: number, y: number) =>
      latest.current.nodes.some((n) => {
        const w = n.width ?? n.data.item.width;
        const h = n.height ?? n.data.item.height;
        return (
          x < n.position.x + w &&
          x + size.width > n.position.x &&
          y < n.position.y + h &&
          y + size.height > n.position.y
        );
      });
    let x = Math.round(centre.x - size.width / 2);
    let y = Math.round(centre.y - size.height / 2);
    for (let step = 0; step < 40 && covers(x, y); step += 1) {
      x += 30;
      y += 30;
    }
    const item: CanvasItem = {
      id: newId(),
      kind,
      x,
      y,
      ...size,
      ...fields,
    };
    const next = [
      ...latest.current.nodes.map((n) => ({ ...n, selected: false })),
      { ...toNode(item), selected: true },
    ];
    setNodes(next);
    changed({ ...latest.current, nodes: next });
    return item;
  };

  const insertImage = async (blob: Blob, name: string) => {
    const ext = imageExtensions[blob.type];
    if (!ext) throw new Error('Paste a PNG, JPEG, WebP, GIF or BMP image.');
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 480 / bitmap.width, 360 / bitmap.height);
    const width = Math.max(60, Math.round(bitmap.width * scale));
    const height = Math.max(40, Math.round(bitmap.height * scale));
    bitmap.close();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const canInsert = () => active.current && !blocked.current;
    if (!canInsert()) return;
    await ctx.vault.ensureDir('attachments');
    const path = 'attachments/' + name + ' ' + crypto.randomUUID() + '.' + ext;
    await ctx.vault.writeBytes(path, bytes);
    if (canInsert()) add('image', { path, width, height });
  };

  const takeScreenshot = async () => {
    setCapturing(true);
    try {
      const image = await captureScreen();
      await insertImage(image, 'Screenshot');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        ctx.app.notify(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setCapturing(false);
    }
  };

  const pasteImage = useEffectEvent((event: ClipboardEvent) => {
    if (!loaded || blocked.current || !board.current || !(event.target instanceof Element)) return;
    if (event.target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
    if (
      event.target !== document.body &&
      !board.current.closest('.canvas-view')?.contains(event.target)
    )
      return;
    const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (!images.length) return;
    event.preventDefault();
    void (async () => {
      for (const image of images) await insertImage(image, 'Pasted image');
    })().catch((error: unknown) => {
      ctx.app.notify(String(error));
    });
  });

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      pasteImage(event);
    }
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  useEffect(() => {
    function find(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'f'
      )
        return;
      const view = board.current?.closest('.canvas-view');
      if (!view || !(event.target instanceof Element) || event.target.closest('[role="dialog"]'))
        return;
      if (event.target !== document.body && !view.contains(event.target)) return;
      event.preventDefault();
      setSearch(true);
      view.querySelector<HTMLInputElement>('input[type="search"]')?.select();
    }
    document.addEventListener('keydown', find);
    return () => {
      document.removeEventListener('keydown', find);
    };
  }, []);
  const locate = (match: BoardMatch) => {
    const state = latest.current;
    const next = {
      nodes: state.nodes.map((node) => ({
        ...node,
        selected: !match.edge && node.id === match.id,
      })),
      edges: state.edges.map((edge) => ({
        ...edge,
        selected: !!match.edge && edge.id === match.id,
      })),
    };
    latest.current = next;
    setNodes(next.nodes);
    setEdges(next.edges);
    void flow.fitView({
      nodes: match.nodes.map((id) => ({ id })),
      maxZoom: 1.3,
      padding: 0.35,
      duration: 180,
    });
  };
  const sticky = { width: 160, height: 150, shape: 'rectangle', fill: 'yellow', border: 'none' };

  const addBranch = (parent: CardNode) => {
    const item = add(
      'text',
      { text: '', height: 90, fill: cardLook(parent.data.item).fill },
      {
        x: parent.position.x + (parent.width ?? parent.data.item.width) + 190,
        y: parent.position.y + (parent.height ?? parent.data.item.height) / 2,
      },
    );
    const next = [...latest.current.edges, toEdge({ id: newId(), from: parent.id, to: item.id })];
    setEdges(next);
    changed({ ...latest.current, edges: next });
    void flow.fitView({
      nodes: [{ id: parent.id }, { id: item.id }],
      maxZoom: flow.getZoom(),
      duration: 200,
    });
  };

  const arrange = (action: string) => {
    const state = latest.current;
    const selected = state.nodes.filter((n) => n.selected);
    if (!selected.length) return;
    if (action === 'duplicate') {
      const entries = selected.map((node) => ({ node, id: newId() }));
      const ids = new Map(entries.map(({ node, id }) => [node.id, id]));
      const copies = entries.map(({ node: n, id }) => ({
        ...toNode({
          ...n.data.item,
          id,
          x: n.position.x + 36,
          y: n.position.y + 36,
          width: n.width ?? n.data.item.width,
          height: n.height ?? n.data.item.height,
        }),
        selected: true,
      }));
      const links = state.edges.flatMap((edge) => {
        const from = ids.get(edge.source);
        const to = ids.get(edge.target);
        return from && to ? [toEdge({ ...linkOf(edge), id: newId(), from, to })] : [];
      });
      const next = {
        nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), ...copies],
        edges: [...state.edges.map((e) => ({ ...e, selected: false })), ...links],
      };
      setNodes(next.nodes);
      setEdges(next.edges);
      changed(next);
      return;
    }
    const axis = action === 'left' || action === 'space-x' ? 'x' : 'y';
    const size = axis === 'x' ? 'width' : 'height';
    selected.sort((a, b) => a.position[axis] - b.position[axis]);
    const first = selected[0];
    const last = selected.at(-1);
    if (!first || !last) return;
    const extent = (n: CardNode) => n[size] ?? n.data.item[size];
    let cursor = first.position[axis];
    const gap =
      (last.position[axis] +
        extent(last) -
        cursor -
        selected.reduce((sum, n) => sum + extent(n), 0)) /
      Math.max(1, selected.length - 1);
    const positions = new Map(
      selected.map((n) => {
        const position = { ...n.position, [axis]: Math.round(cursor) };
        if (action.startsWith('space-')) cursor += extent(n) + Math.max(0, gap);
        return [n.id, position];
      }),
    );
    const next = state.nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position }));
    setNodes(next);
    changed({ ...state, nodes: next });
  };
  const addPage = async () => {
    const name = await ctx.app.askText({ title: 'Add a page', label: 'Page name' });
    if (name === null || name.trim() === '') return;
    const found = await ctx.app.resolveLink(name.trim(), path);
    if (found === null) ctx.app.notify(`No page called "${name.trim()}" was found.`);
    else add('page', { path: found });
  };

  const addFiles = async () => {
    const picked = await ctx.vault.pickFiles({ title: 'Add images or files', multiple: true });
    let outside = 0;
    for (const full of picked) {
      const inside = ctx.vault.vaultPathOf(full);
      if (inside === null) outside += 1;
      else add(kindForPath(inside), { path: inside });
    }
    if (outside > 0) {
      ctx.app.notify('Only files in the vault can go on a canvas. Add the file to a page first.');
    }
  };

  const minZoom = useMemo(
    () =>
      minZoomFor(
        boundsOf(
          nodes.map((n) => ({
            x: n.position.x,
            y: n.position.y,
            width: n.width ?? n.data.item.width,
            height: n.height ?? n.data.item.height,
          })),
        ),
        // The window, not the board: close enough, as the limit leaves room to spare.
        { width: window.innerWidth, height: window.innerHeight },
      ),
    [nodes],
  );
  const showOverview = overview ?? minZoom < USUAL_MIN_ZOOM;

  const shownEdges = routed(edges, nodes);
  const selectedCards = nodes.filter((n) => n.selected === true);
  const incoming =
    selectedCards.length === 1 ? edges.filter((e) => e.target === selectedCards[0]?.id) : [];
  const parent =
    incoming.length === 1 ? nodes.find((n) => n.id === incoming[0]?.source) : undefined;
  const selectedArrows = edges.filter((e) => e.selected === true);

  if (problem !== null) return <p className="notice">This canvas could not be read. {problem}</p>;
  if (!loaded) return <p className="hint">Reading the canvas…</p>;

  return (
    <Actions.Provider value={{ ctx, setText }}>
      <div className="canvas-view">
        <div className="canvas-toolbar">
          <button
            type="button"
            title={
              ctx.views.hasPageView('references.branchOutline')
                ? 'Build sections from this branch'
                : 'Enable Reading and writing in Settings → Modules'
            }
            disabled={
              !ctx.views.hasPageView('references.branchOutline') ||
              selectedCards.length !== 1 ||
              changedElsewhere
            }
            onClick={() => {
              const root = selectedCards[0];
              if (root && base.current)
                void ctx.app
                  .openView(
                    'references.branchOutline',
                    JSON.stringify(
                      branchOutline(toDoc(base.current, nodes, edges), root.data.item),
                    ),
                  )
                  .catch((err: unknown) => {
                    ctx.app.notify(String(err));
                  });
            }}
          >
            Create writing outline
          </button>
          {selectedArrows.length > 0 && !changedElsewhere && (
            <select
              aria-label="Relationship"
              value=""
              onChange={(e) => {
                const label = e.target.value;
                relink((link) => ({ ...link, label }));
              }}
            >
              <option value="">Label relationship…</option>
              {['activates', 'inhibits', 'supports', 'contradicts', 'test next'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={changedElsewhere}
            onClick={() => {
              add('text', { text: '' });
            }}
          >
            Add card
          </button>
          <button type="button" disabled={changedElsewhere} onClick={() => void addPage()}>
            Add page…
          </button>
          <button
            type="button"
            aria-expanded={search}
            onClick={() => {
              setSearch(!search);
            }}
          >
            Find on canvas
          </button>
          <button
            type="button"
            disabled={changedElsewhere || capturing}
            title="Choose a screen, window or tab to capture. You can also paste an image onto this board."
            onClick={() => void takeScreenshot()}
          >
            {capturing ? 'Taking screenshot…' : 'Take screenshot'}
          </button>
          <button type="button" disabled={changedElsewhere} onClick={() => void addFiles()}>
            Add image or file…
          </button>
          <button
            type="button"
            disabled={changedElsewhere}
            onClick={() => add('text', { ...sticky, text: '' })}
          >
            Sticky note
          </button>
          <button
            type="button"
            disabled={changedElsewhere}
            aria-expanded={batch !== null}
            onClick={() => {
              setBatch(batch === null ? '' : null);
            }}
          >
            Bulk notes…
          </button>
          <button
            type="button"
            disabled={changedElsewhere}
            onClick={() =>
              add('text', { text: '', fill: 'none', border: 'none', textSize: 'large', height: 60 })
            }
          >
            Text label
          </button>
          <button
            type="button"
            disabled={changedElsewhere || selectedCards.length !== 1}
            onClick={() => {
              if (selectedCards[0]) addBranch(selectedCards[0]);
            }}
          >
            Add branch
          </button>
          <button
            type="button"
            disabled={changedElsewhere || !parent}
            title="Add another branch to the same parent"
            onClick={() => {
              if (parent) addBranch(parent);
            }}
          >
            Add sibling
          </button>
          <select
            aria-label="Insert shape"
            disabled={changedElsewhere}
            value=""
            onChange={(e) => {
              add('text', { text: '', shape: e.target.value, height: 100 });
            }}
          >
            <option value="" disabled>
              Insert shape…
            </option>
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Oval</option>
            <option value="diamond">Decision diamond</option>
            <option value="pill">Pill</option>
          </select>
          <button
            type="button"
            disabled={changedElsewhere || selectedCards.length !== 2}
            title="Draw an arrow between the selected cards"
            onClick={() => {
              const [from, to] = selectedCards;
              if (from && to)
                onConnect({
                  source: from.id,
                  target: to.id,
                  sourceHandle: null,
                  targetHandle: null,
                });
            }}
          >
            Connect cards
          </button>
          <MapBackground
            value={background}
            disabled={changedElsewhere}
            onChange={(colour) => {
              if (!base.current) return;
              const doc = { ...base.current };
              if (colour) doc['background'] = colour;
              else delete doc['background'];
              base.current = doc;
              setBackground(colour);
              changed({ ...latest.current });
            }}
          />
          <button
            type="button"
            className="quiet"
            aria-pressed={snap}
            onClick={() => {
              setSnap(!snap);
            }}
          >
            Snap to grid
          </button>{' '}
          <button
            type="button"
            className="quiet"
            aria-pressed={showOverview}
            title="A small map of the whole canvas"
            onClick={() => {
              setOverview(!showOverview);
            }}
          >
            Overview
          </button>
        </div>
        {search && (
          <CanvasSearch
            items={nodes.map((node) => node.data.item)}
            links={edges.map(linkOf)}
            locate={locate}
            close={() => {
              setSearch(false);
            }}
          />
        )}
        {batch !== null && !changedElsewhere && (
          <form
            className="canvas-batch"
            onSubmit={(e) => {
              e.preventDefault();
              const lines = batch
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
              const rect = board.current?.getBoundingClientRect();
              if (!rect || !lines.length) return;
              const start = flow.screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              const columns = Math.ceil(Math.sqrt(lines.length));
              const state = latest.current;
              const right = state.nodes.reduce(
                (edge, node) =>
                  Math.max(edge, node.position.x + (node.width ?? node.data.item.width) + 48),
                start.x,
              );
              const items = lines.map((text, i) => ({
                ...toNode({
                  ...sticky,
                  kind: 'text',
                  id: newId(),
                  text,
                  x: right + (i % columns) * 190,
                  y: start.y + Math.floor(i / columns) * 180,
                }),
                selected: true,
              }));
              const next = {
                nodes: [...state.nodes.map((n) => ({ ...n, selected: false })), ...items],
                edges: state.edges.map((edge) => ({ ...edge, selected: false })),
              };
              setNodes(next.nodes);
              setEdges(next.edges);
              changed(next);
              setBatch(null);
              void flow.fitView({ nodes: items, maxZoom: 1, duration: 250 });
            }}
          >
            <label>
              One sticky note per line
              <textarea
                autoFocus
                rows={4}
                value={batch}
                onChange={(e) => {
                  setBatch(e.target.value);
                }}
              />
            </label>
            <button type="submit" disabled={!batch.trim()}>
              Add notes
            </button>
            <button
              type="button"
              onClick={() => {
                setBatch(null);
              }}
            >
              Cancel
            </button>
          </form>
        )}
        <div className="canvas-toolbar canvas-arrange">
          <span className="hint">
            Shift-drag to select cards. Drag between dots to connect them.
          </span>
          {selectedCards.length > 0 && !changedElsewhere && (
            <>
              <button
                type="button"
                onClick={() => {
                  arrange('duplicate');
                }}
              >
                Duplicate
              </button>
              {selectedCards.length > 1 && (
                <select
                  aria-label="Arrange selected cards"
                  value=""
                  onChange={(e) => {
                    arrange(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Arrange…
                  </option>
                  <option value="left">Align left</option>
                  <option value="top">Align top</option>
                  <option value="space-x" disabled={selectedCards.length < 3}>
                    Space horizontally
                  </option>
                  <option value="space-y" disabled={selectedCards.length < 3}>
                    Space vertically
                  </option>
                </select>
              )}
            </>
          )}
        </div>{' '}
        {!changedElsewhere && (
          <CanvasStyleBar
            cards={selectedCards.map((n) => n.data.item)}
            arrows={selectedArrows.map(linkOf)}
            onCards={restyleCards}
            onArrows={restyleArrows}
            onReverse={reverseArrows}
            onName={() => {
              const [edge] = selectedArrows;
              if (edge) nameArrow(edge);
            }}
            onLink={() => {
              const [node] = selectedCards;
              if (node) void linkCard(node);
            }}
          />
        )}
        {changedElsewhere && (
          <div className="notice" role="alert">
            <span>
              This canvas was changed outside BenchWork while you were editing it, so your changes
              were not saved over it.
            </span>
            <button
              type="button"
              onClick={() => {
                dirty.current = false;
                blocked.current = false;
                setChangedElsewhere(false);
                setReads((n) => n + 1);
              }}
            >
              Load the other version
            </button>
          </div>
        )}
        {saveError !== null && (
          <p className="notice">This canvas could not be saved. {saveError}</p>
        )}
        <div
          ref={board}
          className={distance === 'near' ? 'canvas-board' : `canvas-board ${distance}`}
          aria-label="Canvas"
        >
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
            style={background ? { backgroundColor: background } : undefined}
            snapToGrid={snap}
            snapGrid={[24, 24]}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={changedElsewhere ? null : ['Delete', 'Backspace']}
            zoomOnDoubleClick={false}
            nodesDraggable={!changedElsewhere}
            nodesConnectable={!changedElsewhere}
            fitView
            minZoom={minZoom}
            onlyRenderVisibleElements
            onMove={(_e, viewport) => {
              const next =
                viewport.zoom < FARTHER_ZOOM
                  ? 'farther'
                  : viewport.zoom < FAR_ZOOM
                    ? 'far'
                    : 'near';
              if (next !== distance) setDistance(next);
            }}
            proOptions={{ hideAttribution: true }}
            onPaneClick={(e) => {
              // Double-click on empty space: a new card there.
              if (e.detail === 2 && !changedElsewhere) {
                add(
                  'text',
                  { text: '' },
                  flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                );
              }
            }}
            onEdgeDoubleClick={(_e, edge) => {
              nameArrow(edge);
            }}
          >
            <Background gap={24} bgColor={background ?? 'var(--bg)'} />
            <Controls showInteractive={false} />
            {showOverview && (
              <MiniMap
                pannable
                zoomable
                ariaLabel="Overview of the canvas"
                nodeColor={(n: CardNode) => {
                  const fill = cardLook(n.data.item).fill;
                  return fill === null || fill === SEE_THROUGH ? 'var(--border)' : colourVar(fill);
                }}
              />
            )}
          </ReactFlow>
        </div>
      </div>
    </Actions.Provider>
  );
}
