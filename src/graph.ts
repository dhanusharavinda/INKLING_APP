import { Entry, EmotionKey } from './types';
import { EMOTIONS } from './emotions';
import { extractThemes } from './ai';
import { palette } from './theme';

export type NodeKind = 'emotion' | 'theme' | 'philosopher' | 'entry';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  r: number; // radius
  count: number; // how many entries touch this node
  entryId?: string; // for entry nodes
  school?: string; // for philosopher nodes
}

export interface GraphEdge {
  a: string;
  b: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacency: Map<string, Set<string>>;
  truncated: number; // how many older entries were left out
}

export const MAX_GRAPH_ENTRIES = 30;

export function themesOf(entry: Entry): string[] {
  const t = entry.analysis.themes;
  if (t && t.length > 0) return t;
  return extractThemes(entry.text); // legacy entries saved before themes existed
}

// Build nodes and edges from journal entries:
// every entry connects to its emotion, its themes, and its philosopher.
export function buildGraph(entries: Entry[]): GraphData {
  const recent = [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_GRAPH_ENTRIES);
  const truncated = entries.length - recent.length;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const bump = (node: GraphNode) => {
    const existing = nodes.get(node.id);
    if (existing) existing.count += 1;
    else nodes.set(node.id, node);
  };

  for (const e of recent) {
    const emotion: EmotionKey = e.analysis.emotion;
    const meta = EMOTIONS[emotion];
    const entryNodeId = `entry:${e.id}`;
    nodes.set(entryNodeId, {
      id: entryNodeId,
      kind: 'entry',
      label: new Date(e.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      color: meta.color,
      r: 7,
      count: 1,
      entryId: e.id,
    });

    const emotionId = `emotion:${emotion}`;
    bump({
      id: emotionId,
      kind: 'emotion',
      label: meta.label,
      color: meta.color,
      r: 0,
      count: 1,
    });
    edges.push({ a: entryNodeId, b: emotionId });

    for (const theme of themesOf(e).slice(0, 3)) {
      const themeId = `theme:${theme}`;
      bump({ id: themeId, kind: 'theme', label: theme, color: palette.accent, r: 0, count: 1 });
      edges.push({ a: entryNodeId, b: themeId });
    }

    const phil = e.analysis.philosopher;
    if (phil?.name) {
      const philId = `phil:${phil.name}`;
      bump({
        id: philId,
        kind: 'philosopher',
        label: phil.name,
        color: palette.gold,
        r: 0,
        count: 1,
        school: phil.school,
      });
      edges.push({ a: entryNodeId, b: philId });
    }
  }

  // size hub nodes by how many entries they touch
  for (const n of nodes.values()) {
    if (n.kind === 'emotion') n.r = Math.min(26, 13 + n.count * 2.5);
    if (n.kind === 'theme') n.r = Math.min(22, 10 + n.count * 2.5);
    if (n.kind === 'philosopher') n.r = Math.min(22, 11 + n.count * 2);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const { a, b } of edges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  return { nodes: [...nodes.values()], edges, adjacency, truncated };
}

export interface Point {
  x: number;
  y: number;
}

// Deterministic force-directed layout. Runs synchronously; node counts stay small.
export function layoutGraph(
  data: GraphData,
  width: number,
  height: number,
  seed: number
): Record<string, Point> {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * 0.38;
  const ringFor: Record<NodeKind, number> = {
    emotion: 0.35,
    theme: 0.6,
    philosopher: 0.75,
    entry: 0.95,
  };

  const pos: Record<string, Point & { vx: number; vy: number }> = {};
  data.nodes.forEach((n, i) => {
    const angle = rand() * Math.PI * 2 + i;
    const radius = R * ringFor[n.kind] * (0.7 + rand() * 0.5);
    pos[n.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const ids = data.nodes.map((n) => n.id);
  const restLength = 64;

  for (let iter = 0; iter < 240; iter++) {
    // pairwise repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]];
        const b = pos[ids[j]];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const f = Math.min(6, 1500 / d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    // springs along edges
    for (const { a: ia, b: ib } of data.edges) {
      const a = pos[ia];
      const b = pos[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = (d - restLength) * 0.025;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    // gentle pull toward center + integrate
    for (const id of ids) {
      const p = pos[id];
      p.vx += (cx - p.x) * 0.012;
      p.vy += (cy - p.y) * 0.012;
      p.x += Math.max(-12, Math.min(12, p.vx));
      p.y += Math.max(-12, Math.min(12, p.vy));
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }

  const out: Record<string, Point> = {};
  const pad = 26;
  for (const n of data.nodes) {
    const p = pos[n.id];
    out[n.id] = {
      x: Math.max(pad, Math.min(width - pad, p.x)),
      y: Math.max(pad, Math.min(height - pad, p.y)),
    };
  }
  return out;
}
