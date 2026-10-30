import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ModuleContext } from '@core/api';
import {
  DEFAULT_SIZE,
  kindForPath,
  newId,
  parseCanvas,
  serialiseCanvas,
  type CanvasDoc,
  type CanvasItem,
  type CanvasLink,
  type KnownKind,
} from './canvasFile';
import { plainText } from './outline';
import { CanvasStyleBar } from './CanvasStyleBar';
import {
  ARROW_DEFAULTS,
  arrowLook,
  CARD_DEFAULTS,
  cardClass,
  cardLook,
  cardStyle,
  edgeLook,
  SIDES,
  withLook,
  type ArrowLook,
  type CardLook,
} from './canvasStyle';

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
  const { setText } = useActions();
  const [editing, setEditing] = useState(data.item.text === '');
  const [draft, setDraft] = useState(data.item.text ?? '');
  return (
    <CardFrame
      item={data.item}
      kind="text-card"
      selected={selected}
      min={{ width: 80, height: 40 }}
      onDoubleClick={() => {
        setDraft(data.item.text ?? '');
        setEditing(true);
      }}
    >
      {editing ? (
        <textarea
          className="nodrag nowheel"
          aria-label="Card text"
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={() => {
            setEditing(false);
            if (draft !== data.item.text) setText(id, draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ) : (
        <p className="card-text">
          {data.item.text === '' ? 'Double-click to write' : data.item.text}
        </p>
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
      <p className="card-preview">{preview ?? 'This page could not be found.'}</p>
    </CardFrame>
  );
}

function ImageCard({ data, selected }: NodeProps<CardNode>) {
  const { ctx } = useActions();
  const path = data.item.path ?? '';
  const url = ctx.vault.fileUrl(path);
  return (
    <CardFrame
      item={data.item}
      kind="image-card"
      selected={selected}
      min={{ width: 60, height: 40 }}
      title="Double-click to open"
      onDoubleClick={() => void ctx.app.open(path)}
    >
      {url === null ? (
        <p className="card-preview">{fileName(path)} could not be found.</p>
      ) : (
        <img src={url} alt={fileName(path)} draggable={false} />
      )}
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
      <Board ctx={ctx} path={path} />
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
        n.id === id ? { ...n, data: { item: { ...n.data.item, text } } } : n,
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
    const size = DEFAULT_SIZE[kind];
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

  const shownEdges = routed(edges, nodes);
  const selectedCards = nodes.filter((n) => n.selected === true);
  const selectedArrows = edges.filter((e) => e.selected === true);

  if (problem !== null) return <p className="notice">This canvas could not be read. {problem}</p>;
  if (!loaded) return <p className="hint">Reading the canvas…</p>;

  return (
    <Actions.Provider value={{ ctx, setText }}>
      <div className="canvas-view">
        <div className="canvas-toolbar">
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
          <button type="button" disabled={changedElsewhere} onClick={() => void addFiles()}>
            Add image or file…
          </button>
          <span className="hint">
            Drag from a dot to draw an arrow. Select cards or arrows to change their look.
          </span>
        </div>
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
        <div ref={board} className="canvas-board" aria-label="Canvas">
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
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
            minZoom={0.1}
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
            <Background gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </Actions.Provider>
  );
}
