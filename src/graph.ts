import { Entry, EmotionKey } from './types';
import { EMOTIONS, EMOTION_KEYS } from './emotions';
import { extractThemes } from './ai';

export function themesOf(entry: Entry): string[] {
  const t = entry.analysis.themes;
  if (t && t.length > 0) return t;
  return extractThemes(entry.text); // legacy entries saved before themes existed
}

// ---------- Topic graph (Obsidian-style co-occurrence network) ----------

export interface TopicNode {
  id: string;
  label: string;
  count: number; // entries mentioning this topic; drives circle size
  r: number;
  color: string;
  deep: string;
  dominantEmotion: EmotionKey;
}

export interface TopicEdge {
  a: string;
  b: string;
  weight: number; // how many entries mention both topics
}

export interface TopicGraph {
  nodes: TopicNode[];
  edges: TopicEdge[];
  adjacency: Map<string, Set<string>>;
  entriesByTopic: Map<string, Entry[]>;
}

export function topicRadius(count: number): number {
  return Math.min(52, 16 + count * 5);
}

export function buildTopicGraph(entries: Entry[]): TopicGraph {
  const counts = new Map<string, number>();
  const entriesByTopic = new Map<string, Entry[]>();
  const emotionsByTopic = new Map<string, Map<EmotionKey, number>>();
  const pairWeights = new Map<string, number>();

  for (const e of entries) {
    const topics = [...new Set(themesOf(e))];
    for (const t of topics) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
      entriesByTopic.set(t, [...(entriesByTopic.get(t) ?? []), e]);
      const em = emotionsByTopic.get(t) ?? new Map<EmotionKey, number>();
      em.set(e.analysis.emotion, (em.get(e.analysis.emotion) ?? 0) + 1);
      emotionsByTopic.set(t, em);
    }
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const key = [topics[i], topics[j]].sort().join('|');
        pairWeights.set(key, (pairWeights.get(key) ?? 0) + 1);
      }
    }
  }

  const nodes: TopicNode[] = [...counts.entries()].map(([label, count]) => {
    const em = emotionsByTopic.get(label)!;
    let dominant: EmotionKey = 'calm';
    let max = -1;
    for (const k of EMOTION_KEYS) {
      const c = em.get(k) ?? 0;
      if (c > max) {
        max = c;
        dominant = k;
      }
    }
    const meta = EMOTIONS[dominant];
    return {
      id: `topic:${label}`,
      label,
      count,
      r: topicRadius(count),
      color: meta.color,
      deep: meta.deep,
      dominantEmotion: dominant,
    };
  });

  const edges: TopicEdge[] = [...pairWeights.entries()].map(([key, weight]) => {
    const [a, b] = key.split('|');
    return { a: `topic:${a}`, b: `topic:${b}`, weight };
  });

  const adjacency = new Map<string, Set<string>>();
  for (const { a, b } of edges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  // entries newest first for the detail panel
  for (const [k, list] of entriesByTopic) {
    entriesByTopic.set(
      k,
      [...list].sort((x, y) => y.createdAt - x.createdAt)
    );
  }

  return { nodes, edges, adjacency, entriesByTopic };
}

// ---------- Force-directed layout ----------

export interface Point {
  x: number;
  y: number;
}

export function layoutNodes(
  nodes: { id: string; r: number }[],
  edges: { a: string; b: string }[],
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
  const R = Math.min(width, height) * 0.4;

  const pos: Record<string, Point & { vx: number; vy: number }> = {};
  nodes.forEach((n, i) => {
    const angle = rand() * Math.PI * 2 + i;
    const radius = R * (0.3 + rand() * 0.7);
    pos[n.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const rById = new Map(nodes.map((n) => [n.id, n.r]));
  const ids = nodes.map((n) => n.id);

  for (let iter = 0; iter < 260; iter++) {
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
        // stronger repulsion between big circles so labels never collide
        const minGap = (rById.get(ids[i])! + rById.get(ids[j])!) * 1.25 + 14;
        const f = d < minGap ? Math.min(10, (minGap - d) * 0.3 + 2) : Math.min(5, 2200 / d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const { a: ia, b: ib } of edges) {
      const a = pos[ia];
      const b = pos[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const rest = (rById.get(ia)! + rById.get(ib)!) * 1.4 + 34;
      const f = (d - rest) * 0.02;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const id of ids) {
      const p = pos[id];
      p.vx += (cx - p.x) * 0.01;
      p.vy += (cy - p.y) * 0.01;
      p.x += Math.max(-14, Math.min(14, p.vx));
      p.y += Math.max(-14, Math.min(14, p.vy));
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }

  const out: Record<string, Point> = {};
  for (const n of nodes) {
    const p = pos[n.id];
    const pad = n.r + 8;
    out[n.id] = {
      x: Math.max(pad, Math.min(width - pad, p.x)),
      y: Math.max(pad, Math.min(height - pad, p.y)),
    };
  }
  return out;
}
