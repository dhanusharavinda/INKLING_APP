import React, { useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { CanvasItem, CanvasText, Stroke } from '../types';
import { CANVAS_BG, DRAW_SPACE, shapeToPath, strokeToPath } from '../drawing';
import { palette, serif, shadeHex, tintHex } from '../theme';

// Cute pastel pens for the shared doodle board.
const PENS = [
  '#E76B8D', // rose
  '#F2994A', // tangerine
  '#F5C541', // sunshine
  '#6FCF97', // mint
  '#4FA8E8', // sky
  '#9B7EDE', // lilac
  '#8B5E4A', // cocoa
  '#3A3340', // ink
];
// The expanded page earns the full paint box: 20 essentials in two tidy rows.
const PENS_BIG = [
  '#3A3340', // ink
  '#868E96', // grey
  '#FFFFFF', // white
  '#8B5E4A', // cocoa
  '#E76B8D', // rose
  '#D6336C', // raspberry
  '#F2789F', // pink
  '#F2994A', // tangerine
  '#E8590C', // burnt orange
  '#F5C541', // sunshine
  '#FFE066', // lemon
  '#6FCF97', // mint
  '#2F9E44', // forest
  '#12B886', // teal
  '#74C0FC', // baby blue
  '#4FA8E8', // sky
  '#1864AB', // navy
  '#9B7EDE', // lilac
  '#6741D9', // violet
  '#E599F7', // orchid
];
const WIDTHS = [1.2, 2.5, 5, 9]; // from fine-liner to marker
const TEXT_SIZES = [7, 11, 16];
const ERASER_SCALE = 2.4; // the eraser is a chunky background-colored pen
const MAX_ZOOM = 8;

// Hold a pen to fan out its whole family of shades (Instagram-style).
function shadesOf(base: string): string[] {
  return [
    tintHex(base, 0.82),
    tintHex(base, 0.65),
    tintHex(base, 0.48),
    tintHex(base, 0.32),
    tintHex(base, 0.16),
    base,
    shadeHex(base, 0.14),
    shadeHex(base, 0.28),
    shadeHex(base, 0.42),
    shadeHex(base, 0.58),
  ];
}

// Ray casting: is the point inside the polygon drawn by these stroke points?
function pointInPolygon(x: number, y: number, pts: number[]): boolean {
  let inside = false;
  const n = Math.floor(pts.length / 2);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const yj = pts[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A stroke counts as a closed outline when its ends (nearly) meet.
function isClosedStroke(s: Stroke): boolean {
  const p = s.points;
  if (!Array.isArray(p) || p.length < 8) return false;
  const dx = p[0] - p[p.length - 2];
  const dy = p[1] - p[p.length - 1];
  return Math.hypot(dx, dy) <= Math.max(8, s.width * 1.5);
}

type Draft = Omit<CanvasText, 'id' | 'author'>;

interface TraceImage {
  uri: string;
  ratio: number; // natural width / height
  x: number; // 0..100 space, center
  y: number;
  scale: number; // width as a fraction of the page (0.1 .. 3)
  rotation: number; // degrees
  opacity: number;
  adjusting: boolean;
}

interface Props {
  items: CanvasItem[]; // everything on the shared board (both people)
  onStroke: (s: Stroke) => void; // a finished line of mine
  onText: (t: Draft) => void; // a placed text/emoji sticker of mine
  onFill: (color: string) => void; // paint-bucket: flood the page with a color
  onShape: (points: number[], color: string) => void; // bucket inside a closed outline
  onUndo: () => void; // remove my latest item
  onRedo: () => void; // bring back what I just undid
  onClear: () => void; // wipe the board (parent confirms)
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  disabled?: boolean;
  bigPalette?: boolean; // the 20-color paint box (expanded page)
  zoomable?: boolean; // two-finger zoom + pan for precise lines (expanded page)
  onPickTraceImage?: () => Promise<{ uri: string; ratio: number } | null>;
}

export default function DrawingCanvas({
  items,
  onStroke,
  onText,
  onFill,
  onShape,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  canClear,
  disabled = false,
  bigPalette = false,
  zoomable = false,
  onPickTraceImage,
}: Props) {
  const pens = bigPalette ? PENS_BIG : PENS;
  const [size, setSize] = useState(280);
  const [pen, setPen] = useState(PENS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const [bucket, setBucket] = useState(false);
  const [live, setLive] = useState<Stroke | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };

  // text stickers: composed in a modal (keyboard-safe), then dragged into
  // place; a two-finger pinch on the canvas resizes the draft before sticking
  const [composerOpen, setComposerOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textSize, setTextSize] = useState(TEXT_SIZES[1]);
  const [textColor, setTextColor] = useState(PENS[0]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shadeBase, setShadeBase] = useState<string | null>(null); // hold a pen
  // two fingers on a draft sticker: pinch resizes, twisting rotates
  const pinchRef = useRef<{ d0: number; a0: number; size0: number; rot0: number } | null>(null);
  // once a gesture has pinched, single-finger moves are ignored until release,
  // so lifting one finger cannot yank the sticker across the page
  const pinchedRef = useRef(false);

  // zoom + pan (expanded page): the whole drawing is scaled/translated in
  // viewBox units; strokes are mapped through the inverse so lines land
  // exactly under the finger at any zoom.
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const zoomStart = useRef<{
    d0: number;
    k0: number;
    focusX: number; // page point (0..100 space) under the fingers at start
    focusY: number;
  } | null>(null);

  // trace mode: a temporary reference photo floats over the page while you
  // draw; it is local-only, never synced, never snapped.
  const [trace, setTrace] = useState<TraceImage | null>(null);
  const traceRef = useRef<TraceImage | null>(null);
  traceRef.current = trace;
  const traceGesture = useRef<{
    d0: number;
    a0: number;
    scale0: number;
    rot0: number;
  } | null>(null);

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const penRef = useRef(pen);
  penRef.current = pen;
  const widthRef = useRef(width);
  widthRef.current = width;
  const eraserRef = useRef(eraser);
  eraserRef.current = eraser;
  const bucketRef = useRef(bucket);
  bucketRef.current = bucket;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const liveRef = useRef<Stroke | null>(null);
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const originRef = useRef({ x: 0, y: 0 });
  const tapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Self-calibrating coordinates: at the moment a touch starts, locationX/Y is
  // exact, so pageXY minus locationXY IS the canvas origin in the same
  // coordinate space as every later pageXY. This kills both the edge glitch
  // (stale locationX during moves) and the fixed offset that measureInWindow
  // produced on devices where pageY includes the status bar.
  const toRaw = (pageX: number, pageY: number) => ({
    x: ((pageX - originRef.current.x) / sizeRef.current) * DRAW_SPACE,
    y: ((pageY - originRef.current.y) / sizeRef.current) * DRAW_SPACE,
  });
  // raw view units -> page space (undo the zoom transform), clamped to page
  const toSpace = (pageX: number, pageY: number) => {
    const r = toRaw(pageX, pageY);
    const v = viewRef.current;
    return {
      x: Math.max(0, Math.min(DRAW_SPACE, (r.x - v.tx) / v.k)),
      y: Math.max(0, Math.min(DRAW_SPACE, (r.y - v.ty) / v.k)),
    };
  };

  const clampView = (k: number, tx: number, ty: number) => {
    const kk = Math.max(1, Math.min(MAX_ZOOM, k));
    const min = -(kk - 1) * DRAW_SPACE;
    return {
      k: kk,
      tx: Math.max(min, Math.min(0, tx)),
      ty: Math.max(min, Math.min(0, ty)),
    };
  };

  const tryBucketAt = (x: number, y: number) => {
    // topmost closed outline under the tap wins
    const list = itemsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind !== 'stroke') continue;
      if (!isClosedStroke(it)) continue;
      if (pointInPolygon(x, y, it.points)) {
        onShapeRef.current(it.points, penRef.current);
        return;
      }
    }
    showHint('tap inside a CLOSED outline to fill it · hold 🪣 to flood the page');
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (evt) => {
        pinchRef.current = null;
        pinchedRef.current = false;
        zoomStart.current = null;
        traceGesture.current = null;
        tapRef.current = null;
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        originRef.current = { x: pageX - locationX, y: pageY - locationY };
        const p = toSpace(pageX, pageY);
        if (traceRef.current?.adjusting) {
          setTrace((t) => (t ? { ...t, x: p.x, y: p.y } : t));
          return;
        }
        if (draftRef.current) {
          setDraft((d) => (d ? { ...d, x: p.x, y: p.y } : d));
          return;
        }
        if (bucketRef.current) {
          tapRef.current = { x: p.x, y: p.y, moved: false };
          return;
        }
        const s: Stroke = {
          color: eraserRef.current ? CANVAS_BG : penRef.current,
          width: eraserRef.current ? widthRef.current * ERASER_SCALE : widthRef.current,
          points: [p.x, p.y],
        };
        liveRef.current = s;
        setLive(s);
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches ?? [];
        if (touches.length >= 2) {
          pinchedRef.current = true;
          const [t1, t2] = touches;
          const d = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
          // two fingers on a draft sticker: pinch to resize, twist to rotate
          if (draftRef.current) {
            const a = Math.atan2(t2.pageY - t1.pageY, t2.pageX - t1.pageX);
            if (!pinchRef.current) {
              pinchRef.current = {
                d0: d,
                a0: a,
                size0: draftRef.current.size,
                rot0: draftRef.current.rotation,
              };
            } else {
              const p = pinchRef.current;
              const size = Math.max(4, Math.min(40, (p.size0 * d) / p.d0));
              const rotation = p.rot0 + ((a - p.a0) * 180) / Math.PI;
              setDraft((cur) => (cur ? { ...cur, size, rotation } : cur));
            }
            return;
          }
          // two fingers on an adjusting trace photo: scale + rotate it
          if (traceRef.current?.adjusting) {
            const a = Math.atan2(t2.pageY - t1.pageY, t2.pageX - t1.pageX);
            if (!traceGesture.current) {
              traceGesture.current = {
                d0: d,
                a0: a,
                scale0: traceRef.current.scale,
                rot0: traceRef.current.rotation,
              };
            } else {
              const g = traceGesture.current;
              const scale = Math.max(0.1, Math.min(3, (g.scale0 * d) / g.d0));
              const rotation = g.rot0 + ((a - g.a0) * 180) / Math.PI;
              setTrace((t) => (t ? { ...t, scale, rotation } : t));
            }
            return;
          }
          // two fingers on the page itself: zoom + pan (expanded mode)
          if (zoomable) {
            if (liveRef.current) {
              // a line was mid-draw when the second finger landed: discard it
              liveRef.current = null;
              setLive(null);
            }
            const midRaw = toRaw((t1.pageX + t2.pageX) / 2, (t1.pageY + t2.pageY) / 2);
            const v = viewRef.current;
            if (!zoomStart.current) {
              zoomStart.current = {
                d0: d,
                k0: v.k,
                focusX: (midRaw.x - v.tx) / v.k,
                focusY: (midRaw.y - v.ty) / v.k,
              };
            } else {
              const z = zoomStart.current;
              const k = Math.max(1, Math.min(MAX_ZOOM, (z.k0 * d) / z.d0));
              // keep the page point that was under the fingers under them still
              setView(clampView(k, midRaw.x - z.focusX * k, midRaw.y - z.focusY * k));
            }
          }
          return;
        }
        pinchRef.current = null;
        traceGesture.current = null;
        zoomStart.current = null;
        if (pinchedRef.current) return; // pinch ended; wait for a fresh touch
        const { pageX, pageY } = evt.nativeEvent;
        const p = toSpace(pageX, pageY);
        if (traceRef.current?.adjusting) {
          setTrace((t) => (t ? { ...t, x: p.x, y: p.y } : t));
          return;
        }
        if (draftRef.current) {
          setDraft((d) => (d ? { ...d, x: p.x, y: p.y } : d));
          return;
        }
        if (tapRef.current) {
          if (Math.hypot(p.x - tapRef.current.x, p.y - tapRef.current.y) > 3) {
            tapRef.current.moved = true;
          }
          return;
        }
        const cur = liveRef.current;
        if (!cur) return;
        const next: Stroke = { ...cur, points: [...cur.points, p.x, p.y] };
        liveRef.current = next;
        setLive(next);
      },
      onPanResponderRelease: () => {
        pinchRef.current = null;
        zoomStart.current = null;
        traceGesture.current = null;
        const tap = tapRef.current;
        tapRef.current = null;
        if (tap && !tap.moved && !pinchedRef.current) {
          tryBucketAt(tap.x, tap.y);
        }
        const done = liveRef.current;
        liveRef.current = null;
        setLive(null);
        if (done && done.points.length >= 2) onStrokeRef.current(done);
      },
      onPanResponderTerminate: () => {
        pinchRef.current = null;
        zoomStart.current = null;
        traceGesture.current = null;
        tapRef.current = null;
        liveRef.current = null;
        setLive(null);
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const placeDraft = () => {
    const t = textInput.trim();
    if (!t) return;
    setDraft({
      kind: 'text',
      text: t.slice(0, 60),
      x: 50,
      y: 50,
      size: textSize,
      color: textColor,
      rotation: 0,
    });
    setComposerOpen(false);
  };
  const commitDraft = () => {
    if (!draft) return;
    onText(draft);
    setDraft(null);
    setTextInput('');
  };

  async function handlePickTrace() {
    if (!onPickTraceImage) return;
    try {
      const picked = await onPickTraceImage();
      if (!picked) return;
      setTrace({
        uri: picked.uri,
        ratio: picked.ratio > 0 ? picked.ratio : 1,
        x: 50,
        y: 50,
        scale: 0.7,
        rotation: 0,
        opacity: 0.45,
        adjusting: true,
      });
    } catch {
      showHint('could not open that image, try another one');
    }
  }

  const rendered: CanvasItem[] = live
    ? [...items, { ...live, kind: 'stroke', id: '·live', author: '' }]
    : items;

  // trace photo geometry in px, following the current zoom transform
  const traceBox = trace
    ? (() => {
        const v = view;
        const wPx = ((trace.scale * DRAW_SPACE * v.k) / DRAW_SPACE) * size;
        const hPx = wPx / trace.ratio;
        const cx = (((trace.x * v.k + v.tx) / DRAW_SPACE) * size);
        const cy = (((trace.y * v.k + v.ty) / DRAW_SPACE) * size);
        return { left: cx - wPx / 2, top: cy - hPx / 2, width: wPx, height: hPx };
      })()
    : null;

  return (
    <View>
      <View
        collapsable={false}
        style={styles.canvas}
        onLayout={(e) => setSize(Math.round(e.nativeEvent.layout.width))}
        {...pan.panHandlers}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${DRAW_SPACE} ${DRAW_SPACE}`}>
          <Rect width={DRAW_SPACE} height={DRAW_SPACE} fill={CANVAS_BG} rx={4} />
          <G transform={`translate(${view.tx}, ${view.ty}) scale(${view.k})`}>
            {rendered.map((it, i) =>
              it.kind === 'fill' ? (
                <Rect key={it.id || i} width={DRAW_SPACE} height={DRAW_SPACE} fill={it.color} rx={4} />
              ) : it.kind === 'shape' ? (
                <Path key={it.id || i} d={shapeToPath(it.points)} fill={it.color} stroke="none" />
              ) : it.kind === 'text' ? (
                <SvgText
                  key={it.id || i}
                  x={it.x}
                  y={it.y}
                  fontSize={it.size}
                  fill={it.color}
                  fontFamily={serif}
                  fontWeight="600"
                  textAnchor="middle"
                  alignmentBaseline="central"
                  transform={
                    it.rotation ? `rotate(${it.rotation}, ${it.x}, ${it.y})` : undefined
                  }
                >
                  {it.text}
                </SvgText>
              ) : (
                <Path
                  key={it.id || i}
                  d={strokeToPath(it)}
                  stroke={it.color}
                  strokeWidth={it.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            )}
            {draft && (
              <SvgText
                x={draft.x}
                y={draft.y}
                fontSize={draft.size}
                fill={draft.color}
                fontFamily={serif}
                fontWeight="600"
                opacity={0.85}
                textAnchor="middle"
                alignmentBaseline="central"
                transform={
                  draft.rotation ? `rotate(${draft.rotation}, ${draft.x}, ${draft.y})` : undefined
                }
              >
                {draft.text}
              </SvgText>
            )}
          </G>
        </Svg>
        {trace && traceBox && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image
              source={{ uri: trace.uri }}
              style={{
                position: 'absolute',
                left: traceBox.left,
                top: traceBox.top,
                width: traceBox.width,
                height: traceBox.height,
                opacity: trace.opacity,
                transform: [{ rotate: `${trace.rotation}deg` }],
              }}
              resizeMode="stretch"
            />
          </View>
        )}
        {rendered.length === 0 && !draft && !trace && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hint}>your shared page, doodle together ♡</Text>
          </View>
        )}
        {draft && (
          <View style={styles.draftBanner} pointerEvents="none">
            <Text style={styles.draftBannerText}>drag · pinch to resize · twist to rotate ♡</Text>
          </View>
        )}
        {trace?.adjusting && (
          <View style={styles.draftBanner} pointerEvents="none">
            <Text style={styles.draftBannerText}>drag · pinch to resize · twist to rotate</Text>
          </View>
        )}
        {!trace?.adjusting && bucket && (
          <View style={styles.draftBanner} pointerEvents="none">
            <Text style={styles.draftBannerText}>🪣 tap inside a closed outline to fill it</Text>
          </View>
        )}
        {zoomable && view.k > 1.02 && (
          <Pressable
            onPress={() => setView({ k: 1, tx: 0, ty: 0 })}
            style={styles.zoomChip}
            hitSlop={6}
          >
            <Text style={styles.zoomChipText}>{view.k.toFixed(1)}× · reset</Text>
          </Pressable>
        )}
      </View>

      {zoomable && (
        <Text style={styles.zoomHint}>two fingers: pinch to zoom, drag to pan · one finger draws</Text>
      )}

      {/* trace photo controls */}
      {trace && (
        <View style={styles.traceRow}>
          {trace.adjusting ? (
            <>
              <Text style={styles.traceLabel}>ghost</Text>
              {[0.25, 0.45, 0.7].map((o) => (
                <Pressable
                  key={o}
                  onPress={() => setTrace((t) => (t ? { ...t, opacity: o } : t))}
                  style={[styles.traceOpacityBtn, trace.opacity === o && styles.toolBtnActive]}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: palette.ink, opacity: 0.3 + o }}>
                    A
                  </Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setTrace((t) => (t ? { ...t, adjusting: false } : t))}
                style={styles.traceDoneBtn}
              >
                <Text style={styles.traceDoneText}>✓ trace it</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.traceLabel}>tracing… draw over the ghost ♡</Text>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setTrace((t) => (t ? { ...t, adjusting: true } : t))}
                hitSlop={6}
              >
                <Text style={styles.action}>adjust</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => setTrace(null)} hitSlop={6} style={{ marginLeft: 12 }}>
            <Text style={[styles.action, { color: palette.inkFaint }]}>✕ remove</Text>
          </Pressable>
        </View>
      )}

      {/* draft actions float right under the canvas, impossible to miss */}
      {draft && (
        <View style={styles.draftActions}>
          <Pressable onPress={commitDraft} style={styles.stickBtn}>
            <Text style={styles.stickBtnText}>✓ stick it</Text>
          </Pressable>
          <Pressable onPress={() => setDraft(null)} style={styles.cancelDraftBtn} hitSlop={6}>
            <Text style={styles.cancelDraftText}>✕ cancel</Text>
          </Pressable>
        </View>
      )}

      {/* hold a pen: its shade family fans out, tap any shade */}
      {shadeBase && (
        <View style={styles.shadeStrip}>
          {shadesOf(shadeBase).map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setPen(c);
                setEraser(false);
                setShadeBase(null);
              }}
              style={[styles.shadeSwatch, { backgroundColor: c }, pen === c && styles.penActive]}
            />
          ))}
          <Pressable onPress={() => setShadeBase(null)} hitSlop={6} style={{ marginLeft: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: palette.inkSoft }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* pens + eraser + text sticker (hold a pen for all its shades) */}
      <View style={[styles.toolsRow, bigPalette && styles.toolsRowWrap]}>
        {pens.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              setPen(c);
              setEraser(false);
            }}
            onLongPress={() => setShadeBase(c)}
            delayLongPress={260}
            style={[
              styles.pen,
              { backgroundColor: c },
              c === '#FFFFFF' && { borderColor: palette.line },
              pen === c && !eraser && styles.penActive,
            ]}
          />
        ))}
        <Pressable
          onPress={() => {
            setBucket(false);
            setEraser((v) => !v);
          }}
          style={[styles.toolBtn, eraser && styles.toolBtnActive]}
          hitSlop={4}
        >
          <Text style={{ fontSize: 13 }}>🧼</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setEraser(false);
            setBucket(false);
            setComposerOpen(true);
          }}
          style={styles.toolBtn}
          hitSlop={4}
        >
          <Text style={{ fontSize: 12, fontWeight: '900', color: palette.ink }}>T😊</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setEraser(false);
            setBucket((v) => {
              if (!v) showHint('tap inside a closed outline to fill it · hold 🪣 to flood the page');
              return !v;
            });
          }}
          onLongPress={() => {
            setBucket(false);
            onFill(eraser ? CANVAS_BG : pen);
          }}
          delayLongPress={420}
          style={[styles.toolBtn, bucket && styles.toolBtnActive]}
          hitSlop={4}
        >
          <Text style={{ fontSize: 13 }}>🪣</Text>
        </Pressable>
        {onPickTraceImage && (
          <Pressable onPress={handlePickTrace} style={styles.toolBtn} hitSlop={4}>
            <Text style={{ fontSize: 13 }}>📷</Text>
          </Pressable>
        )}
      </View>

      {/* widths + actions */}
      <View style={styles.actionsRow}>
        {WIDTHS.map((w) => (
          <Pressable
            key={w}
            onPress={() => setWidth(w)}
            style={[styles.widthBtn, width === w && styles.toolBtnActive]}
          >
            <View
              style={{
                width: 4 + w * 1.6,
                height: 4 + w * 1.6,
                borderRadius: 99,
                backgroundColor: palette.ink,
              }}
            />
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onUndo} disabled={!canUndo} hitSlop={6}>
          <Text style={[styles.action, !canUndo && { opacity: 0.35 }]}>↩ undo</Text>
        </Pressable>
        <Pressable onPress={onRedo} disabled={!canRedo} hitSlop={6} style={{ marginLeft: 12 }}>
          <Text style={[styles.action, !canRedo && { opacity: 0.35 }]}>↪ redo</Text>
        </Pressable>
        <Pressable onPress={onClear} disabled={!canClear} hitSlop={6} style={{ marginLeft: 12 }}>
          <Text style={[styles.action, !canClear && { opacity: 0.35 }]}>✕ clear</Text>
        </Pressable>
      </View>

      {hint && <Text style={styles.bucketHint}>{hint}</Text>}

      {/* keyboard-safe sticker composer */}
      <Modal
        visible={composerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setComposerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add a little something ♡</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="text or emoji, e.g. 🐥 hi"
              placeholderTextColor={palette.inkFaint}
              value={textInput}
              onChangeText={setTextInput}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>size</Text>
              {TEXT_SIZES.map((s, i) => (
                <Pressable
                  key={s}
                  onPress={() => setTextSize(s)}
                  style={[styles.sizeBtn, textSize === s && styles.toolBtnActive]}
                >
                  <Text style={{ fontSize: 11 + i * 3, fontWeight: '800', color: palette.ink }}>
                    A
                  </Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Text style={styles.modalLabel}>pinch on page to fine-tune</Text>
            </View>
            <View style={[styles.modalRow, { flexWrap: 'wrap' }]}>
              <Text style={styles.modalLabel}>color</Text>
              {PENS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setTextColor(c)}
                  style={[
                    styles.pen,
                    { backgroundColor: c },
                    textColor === c && styles.penActive,
                  ]}
                />
              ))}
            </View>
            <Pressable
              onPress={placeDraft}
              style={[styles.placeBtn, !textInput.trim() && { opacity: 0.4 }]}
              disabled={!textInput.trim()}
            >
              <Text style={styles.placeBtnText}>place on the page</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F6DCE5',
    // web: fingers must draw, not scroll the page (crucial on iPhone Safari)
    ...(Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'crosshair' } as object) : null),
  },
  hintWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: palette.inkFaint, fontStyle: 'italic', fontSize: 13 },
  draftBanner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(58,51,64,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  draftBannerText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  zoomChip: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(58,51,64,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  zoomChipText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  zoomHint: {
    fontSize: 10.5,
    color: palette.inkFaint,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
  traceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: palette.bg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  traceLabel: { fontSize: 11.5, fontWeight: '700', color: palette.inkSoft },
  traceOpacityBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  traceDoneBtn: {
    backgroundColor: '#7FD1BE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  traceDoneText: { fontSize: 12, fontWeight: '800', color: palette.ink },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
  stickBtn: {
    backgroundColor: '#F2789F',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  stickBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cancelDraftBtn: {
    backgroundColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  cancelDraftText: { color: palette.inkSoft, fontWeight: '800', fontSize: 13 },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  toolsRowWrap: { flexWrap: 'wrap', gap: 7 },
  shadeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    backgroundColor: palette.bg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  shadeSwatch: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: 'transparent' },
  pen: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'transparent' },
  penActive: { borderColor: palette.ink, transform: [{ scale: 1.15 }] },
  toolBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  toolBtnActive: { backgroundColor: '#F6DCE5', borderWidth: 2, borderColor: palette.ink },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  widthBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  action: { fontSize: 13, fontWeight: '700', color: palette.accent },
  bucketHint: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D6336C',
    textAlign: 'center',
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,36,51,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 90,
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginBottom: 12 },
  modalInput: {
    backgroundColor: palette.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.ink,
  },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  sizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  placeBtn: {
    backgroundColor: '#F2789F',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  placeBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
