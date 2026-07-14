// MS-Paint style bucket for the vector doodle. The page is rasterized onto a
// fine grid where every drawn line is a wall (the eraser knocks walls down),
// the tapped region floods outward, and the flooded area is traced back into
// polygons (outer ring + holes) that ship as one ordinary canvas item. Tap
// the background and it fills around every closed drawing; tap inside a tiny
// heart and only the heart fills.
import { CanvasItem } from './types';
import { CANVAS_BG, DRAW_SPACE } from './drawing';

const RES = 200; // grid cells per side; one cell = half a canvas unit
const CELL = DRAW_SPACE / RES;

export interface FloodRegion {
  points: number[]; // one boundary ring, flat [x1,y1,...] in canvas units
  holes: number[][]; // remaining rings; rendered together with even-odd fill
}

function markDisc(grid: Uint8Array, ux: number, uy: number, r: number, val: 0 | 1) {
  const cr = Math.max(1, Math.round(r / CELL));
  const gx = Math.round(ux / CELL);
  const gy = Math.round(uy / CELL);
  const r2 = cr * cr;
  for (let y = Math.max(0, gy - cr); y <= Math.min(RES - 1, gy + cr); y++) {
    for (let x = Math.max(0, gx - cr); x <= Math.min(RES - 1, gx + cr); x++) {
      const dx = x - gx;
      const dy = y - gy;
      if (dx * dx + dy * dy <= r2) grid[y * RES + x] = val;
    }
  }
}

function markPolyline(grid: Uint8Array, pts: number[], r: number, val: 0 | 1) {
  if (!Array.isArray(pts) || pts.length < 2 || pts.some((n) => !Number.isFinite(n))) return;
  let px = pts[0];
  let py = pts[1];
  markDisc(grid, px, py, r, val);
  for (let i = 2; i < pts.length - 1; i += 2) {
    const qx = pts[i];
    const qy = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(qx - px, qy - py) / (CELL * 0.7)));
    for (let s = 1; s <= steps; s++) {
      markDisc(grid, px + ((qx - px) * s) / steps, py + ((qy - py) * s) / steps, r, val);
    }
    px = qx;
    py = qy;
  }
}

const closeRing = (pts: number[]) =>
  pts.length >= 4 ? [...pts, pts[0], pts[1]] : pts;

// Walls are strokes (at their real width) and the boundaries of earlier
// bucket fills. The eraser is background-colored, so it OPENS walls — erase a
// gap in an outline and paint leaks out of it, exactly like MS Paint. A
// whole-page flood resets the page, so anything under it stops being a wall.
function rasterizeWalls(items: CanvasItem[]): Uint8Array {
  const grid = new Uint8Array(RES * RES);
  const bg = CANVAS_BG.toUpperCase();
  for (const it of items) {
    if (it.kind === 'fill') {
      grid.fill(0);
      continue;
    }
    if (it.kind === 'text') continue; // stickers float, they are not walls
    if (it.kind === 'shape') {
      markPolyline(grid, closeRing(it.points), 0.45, 1);
      for (const h of it.holes ?? []) markPolyline(grid, closeRing(h), 0.45, 1);
      continue;
    }
    const erase = typeof it.color === 'string' && it.color.toUpperCase() === bg;
    const r = Math.max(0.5, (Number.isFinite(it.width) ? it.width : 4) / 2);
    markPolyline(grid, it.points, r, erase ? 0 : 1);
  }
  return grid;
}

// Ramer-Douglas-Peucker: melts the raster staircase into clean lines.
function rdp(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const bx = pts[b * 2];
    const by = pts[b * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out;
}

// Drop middle points of straight runs (the raster boundary is full of them).
function mergeCollinear(pts: number[]): number[] {
  const n = pts.length / 2;
  if (n <= 3) return pts;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = pts[((i - 1 + n) % n) * 2];
    const py = pts[((i - 1 + n) % n) * 2 + 1];
    const cx = pts[i * 2];
    const cy = pts[i * 2 + 1];
    const nx = pts[((i + 1) % n) * 2];
    const ny = pts[((i + 1) % n) * 2 + 1];
    if ((cx - px) * (ny - cy) - (cy - py) * (nx - cx) !== 0) out.push(cx, cy);
  }
  return out.length >= 6 ? out : pts;
}

// Flood from the tapped point and trace the region's boundary loops.
export function floodFillRegion(items: CanvasItem[], x: number, y: number): FloodRegion | null {
  const walls = rasterizeWalls(items);
  let sx = Math.max(0, Math.min(RES - 1, Math.floor(x / CELL)));
  let sy = Math.max(0, Math.min(RES - 1, Math.floor(y / CELL)));
  if (walls[sy * RES + sx]) {
    // tapped right on a line: nudge to the nearest open cell
    let found = false;
    for (let rr = 1; rr <= 4 && !found; rr++) {
      for (let dy = -rr; dy <= rr && !found; dy++) {
        for (let dx = -rr; dx <= rr && !found; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx >= 0 && ny >= 0 && nx < RES && ny < RES && !walls[ny * RES + nx]) {
            sx = nx;
            sy = ny;
            found = true;
          }
        }
      }
    }
    if (!found) return null;
  }

  // BFS flood (4-connected, walls block)
  const filled = new Uint8Array(RES * RES);
  const queue = new Int32Array(RES * RES);
  let qh = 0;
  let qt = 0;
  const start = sy * RES + sx;
  filled[start] = 1;
  queue[qt++] = start;
  while (qh < qt) {
    const c = queue[qh++];
    const cx = c % RES;
    if (cx > 0 && !filled[c - 1] && !walls[c - 1]) {
      filled[c - 1] = 1;
      queue[qt++] = c - 1;
    }
    if (cx < RES - 1 && !filled[c + 1] && !walls[c + 1]) {
      filled[c + 1] = 1;
      queue[qt++] = c + 1;
    }
    if (c >= RES && !filled[c - RES] && !walls[c - RES]) {
      filled[c - RES] = 1;
      queue[qt++] = c - RES;
    }
    if (c < RES * (RES - 1) && !filled[c + RES] && !walls[c + RES]) {
      filled[c + RES] = 1;
      queue[qt++] = c + RES;
    }
  }

  // boundary edges on the lattice, region kept on a consistent side, so
  // every loop closes; even-odd fill makes outer-vs-hole labeling irrelevant
  const V = RES + 1;
  const edges = new Map<number, number[]>(); // start vertex -> end vertices
  const addEdge = (a: number, b: number) => {
    const list = edges.get(a);
    if (list) list.push(b);
    else edges.set(a, [b]);
  };
  const isFilled = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < RES && cy < RES && filled[cy * RES + cx] === 1;
  for (let cy = 0; cy < RES; cy++) {
    for (let cx = 0; cx < RES; cx++) {
      if (!filled[cy * RES + cx]) continue;
      if (!isFilled(cx, cy - 1)) addEdge(cy * V + cx, cy * V + cx + 1);
      if (!isFilled(cx + 1, cy)) addEdge(cy * V + cx + 1, (cy + 1) * V + cx + 1);
      if (!isFilled(cx, cy + 1)) addEdge((cy + 1) * V + cx + 1, (cy + 1) * V + cx);
      if (!isFilled(cx - 1, cy)) addEdge((cy + 1) * V + cx, cy * V + cx);
    }
  }

  const loops: number[][] = [];
  for (const startV of Array.from(edges.keys())) {
    for (;;) {
      const first = edges.get(startV);
      if (!first || first.length === 0) break;
      const loop: number[] = [];
      let cur = startV;
      let prevDir = -9;
      do {
        const outs = edges.get(cur);
        if (!outs || outs.length === 0) break; // degenerate; abandon
        let pick = 0;
        if (outs.length > 1 && prevDir !== -9) {
          // at a saddle vertex keep turning the same way, so loops stay simple
          for (let i = 0; i < outs.length; i++) {
            if (dirOf(cur, outs[i], V) !== ((prevDir + 2) % 4)) {
              pick = i;
              break;
            }
          }
        }
        const next = outs.splice(pick, 1)[0];
        if (outs.length === 0) edges.delete(cur);
        prevDir = dirOf(cur, next, V);
        loop.push((cur % V) * CELL, Math.floor(cur / V) * CELL);
        cur = next;
      } while (cur !== startV);
      if (loop.length >= 6) {
        const simplified = rdp(mergeCollinear(loop), 0.35);
        if (simplified.length >= 6) loops.push(simplified);
      }
    }
  }

  if (loops.length === 0) return null;
  // the ring enclosing the most area is the outer boundary; even-odd
  // rendering would cope either way, but keeping points=outer is tidier
  loops.sort((a, b) => ringArea(b) - ringArea(a));
  return { points: loops[0], holes: loops.slice(1) };
}

function ringArea(pts: number[]): number {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return Math.abs(a / 2);
}

function dirOf(a: number, b: number, v: number): number {
  const ax = a % v;
  const ay = Math.floor(a / v);
  const bx = b % v;
  const by = Math.floor(b / v);
  if (bx > ax) return 0; // right
  if (by > ay) return 1; // down
  if (bx < ax) return 2; // left
  return 3; // up
}
