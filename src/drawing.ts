import { CanvasItem, Stroke } from './types';

// Strokes live in a 0..100 coordinate square so they scale to any surface
// (the in-app canvas, note cards, and the home-screen widget).
export const DRAW_SPACE = 100;

// The paper color everywhere the doodle renders; the eraser paints with it.
export const CANVAS_BG = '#FFF7FA';

// A closed polygon path for bucket-filled shapes.
export function shapeToPath(points: number[]): string {
  if (!Array.isArray(points) || points.length < 6 || points.some((n) => !Number.isFinite(n))) {
    return '';
  }
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length - 1; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  return d + ' Z';
}

export function strokeToPath(s: Stroke): string {
  const pts = s.points;
  if (!Array.isArray(pts) || pts.length < 2 || pts.some((n) => !Number.isFinite(n))) return '';
  if (pts.length === 2) {
    // a dot: draw a tiny segment so the round cap shows
    return `M ${pts[0]} ${pts[1]} L ${pts[0] + 0.01} ${pts[1] + 0.01}`;
  }
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 1; i += 2) {
    d += ` L ${pts[i]} ${pts[i + 1]}`;
  }
  return d;
}

// Drawings round-trip through the cloud from the partner's device, so treat
// them as untrusted: only plain hex colors and finite numbers reach the SVG.
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
function safeColor(c: unknown, fallback = '#3A3340'): string {
  return typeof c === 'string' && HEX_COLOR.test(c) ? c : fallback;
}

// Text on the canvas comes from the partner's device too: escape XML so no
// input can break (or smuggle markup into) the widget SVG.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const clampNum = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;

// A full standalone SVG string of the shared page (used by the Android widget
// and by snaps in the memories calendar). Everything is clipped to the page
// square: old rows drawn during coordinate glitches can carry points outside
// 0..100, and without the clip they leak into the letterbox around the page
// (strokes "outside the box", stickers peeking past a bucket fill).
export function itemsToSvg(items: CanvasItem[], background = '#FFF7FA'): string {
  const body = items
    .map((it) => {
      if (it.kind === 'fill') {
        return `<rect width="${DRAW_SPACE}" height="${DRAW_SPACE}" rx="8" fill="${safeColor(it.color, '#FFF7FA')}"/>`;
      }
      if (it.kind === 'shape') {
        return `<path d="${shapeToPath(it.points)}" fill="${safeColor(it.color)}" stroke="none"/>`;
      }
      if (it.kind === 'text') {
        const x = clampNum(it.x, 0, DRAW_SPACE, 50);
        const y = clampNum(it.y, 0, DRAW_SPACE, 50);
        const size = clampNum(it.size, 3, 40, 9);
        const rot = clampNum((it as { rotation?: number }).rotation, -3600, 3600, 0);
        const transform = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
        return `<text x="${x}" y="${y}" font-size="${size}" fill="${safeColor(it.color)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-weight="600"${transform}>${escapeXml(String(it.text).slice(0, 120))}</text>`;
      }
      const w = Number.isFinite(it.width) ? Math.max(0.5, Math.min(20, it.width)) : 4;
      return `<path d="${strokeToPath(it)}" stroke="${safeColor(it.color)}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DRAW_SPACE} ${DRAW_SPACE}">` +
    `<defs><clipPath id="page"><rect width="${DRAW_SPACE}" height="${DRAW_SPACE}" rx="8"/></clipPath></defs>` +
    `<rect width="${DRAW_SPACE}" height="${DRAW_SPACE}" rx="8" fill="${safeColor(background, '#FFF7FA')}"/>` +
    `<g clip-path="url(#page)">${body}</g></svg>`
  );
}

// Back-compat alias for stroke-only callers.
export function strokesToSvg(strokes: Stroke[], background = '#FFF7FA'): string {
  return itemsToSvg(
    strokes.map((s) => ({ ...s, kind: 'stroke' as const, id: '', author: '' })),
    background
  );
}
