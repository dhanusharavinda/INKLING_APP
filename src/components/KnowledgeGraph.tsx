import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Entry, EmotionKey } from '../types';
import { palette } from '../theme';
import {
  CONSCIOUSNESS_LEVELS,
  consciousnessLevel,
  EMOTIONS,
  emotionMeta,
  frequencyPercent,
  HAWKINS,
} from '../emotions';
import { buildTopicGraph, layoutNodes, Point } from '../graph';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// On web the container position can be read synchronously, which keeps
// tap hit-testing accurate even right after the page scrolls.
function syncOrigin(ref: React.RefObject<View | null>, origin: { current: Point }) {
  if (Platform.OS !== 'web') return;
  const el = ref.current as unknown as HTMLElement | null;
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    origin.current = { x: r.left, y: r.top };
  }
}

interface Props {
  entries: Entry[];
  onOpenEntry: (id: string) => void;
}

type GraphMode = 'topic' | 'emotion';

export default function KnowledgeGraph({ entries, onOpenEntry }: Props) {
  const [mode, setMode] = useState<GraphMode>('topic');

  if (entries.length === 0) {
    return (
      <Text style={styles.emptyText}>Your mind graph will grow here as you write entries.</Text>
    );
  }

  return (
    <View>
      <View style={styles.modeRow}>
        {(
          [
            { key: 'topic', label: '🕸 By topic' },
            { key: 'emotion', label: '🧘 By emotion' },
          ] as { key: GraphMode; label: string }[]
        ).map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
          >
            <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === 'topic' ? (
        <TopicGraphView entries={entries} onOpenEntry={onOpenEntry} />
      ) : (
        <EmotionFrequencyView entries={entries} />
      )}
    </View>
  );
}

// ============================================================
// TOPIC MODE: zoomable co-occurrence network, labels inside circles
// ============================================================

function TopicGraphView({ entries, onOpenEntry }: Props) {
  const [width, setWidth] = useState(320);
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [pos, setPos] = useState<Record<string, Point>>({});
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });

  const graph = useMemo(() => buildTopicGraph(entries), [entries]);
  // canvas grows with the number of topics so big graphs stay readable
  const height = Math.max(340, Math.min(560, 220 + graph.nodes.length * 26));
  const basePos = useMemo(
    () => layoutNodes(graph.nodes, graph.edges, width, height, seed),
    [graph, width, height, seed]
  );

  useEffect(() => {
    setPos(basePos);
    setSelected(null);
    setView({ k: 1, tx: 0, ty: 0 });
  }, [basePos]);

  const posRef = useRef(pos);
  posRef.current = pos;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef({ w: width, h: height });
  sizeRef.current = { w: width, h: height };

  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const gestureRef = useRef<
    | { type: 'node'; id: string }
    | { type: 'pan'; startTx: number; startTy: number }
    | null
  >(null);
  const movedRef = useRef(false);
  const pinchRef = useRef<{ d0: number; k0: number; mid: Point; tx0: number; ty0: number } | null>(
    null
  );

  const toWorld = (lx: number, ly: number): Point => {
    const v = viewRef.current;
    return { x: (lx - v.tx) / v.k, y: (ly - v.ty) / v.k };
  };

  const findNode = (world: Point): string | null => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const n of graphRef.current.nodes) {
      const p = posRef.current[n.id];
      if (!p) continue;
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d < n.r + 10 && d < bestDist) {
        best = n.id;
        bestDist = d;
      }
    }
    return best;
  };

  const zoomAt = (lx: number, ly: number, factor: number) => {
    setView((v) => {
      const k = Math.max(0.35, Math.min(3, v.k * factor));
      return {
        k,
        tx: lx - ((lx - v.tx) / v.k) * k,
        ty: ly - ((ly - v.ty) / v.k) * k,
      };
    });
  };

  // mouse-wheel zoom on web, anchored at the cursor
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 0.87);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        movedRef.current = false;
        pinchRef.current = null;
        syncOrigin(containerRef, originRef);
        const start = (ox: number, oy: number) => {
          const world = toWorld(pageX - ox, pageY - oy);
          const hit = findNode(world);
          gestureRef.current = hit
            ? { type: 'node', id: hit }
            : { type: 'pan', startTx: viewRef.current.tx, startTy: viewRef.current.ty };
        };
        start(originRef.current.x, originRef.current.y);
        containerRef.current?.measureInWindow((wx, wy) => {
          originRef.current = { x: wx, y: wy };
          if (!movedRef.current) start(wx, wy);
        });
      },
      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches ?? [];
        // two-finger pinch zoom
        if (touches.length >= 2) {
          const [t1, t2] = touches;
          const lx1 = t1.pageX - originRef.current.x;
          const ly1 = t1.pageY - originRef.current.y;
          const lx2 = t2.pageX - originRef.current.x;
          const ly2 = t2.pageY - originRef.current.y;
          const d = Math.hypot(lx2 - lx1, ly2 - ly1);
          const mid = { x: (lx1 + lx2) / 2, y: (ly1 + ly2) / 2 };
          if (!pinchRef.current) {
            const v = viewRef.current;
            pinchRef.current = { d0: d, k0: v.k, mid, tx0: v.tx, ty0: v.ty };
          } else {
            const p = pinchRef.current;
            const k = Math.max(0.35, Math.min(3, (p.k0 * d) / p.d0));
            setView({
              k,
              tx: p.mid.x - ((p.mid.x - p.tx0) / p.k0) * k,
              ty: p.mid.y - ((p.mid.y - p.ty0) / p.k0) * k,
            });
          }
          movedRef.current = true;
          return;
        }
        pinchRef.current = null;
        if (Math.abs(gs.dx) + Math.abs(gs.dy) > 6) movedRef.current = true;
        if (!movedRef.current) return;
        const g = gestureRef.current;
        if (!g) return;
        if (g.type === 'node') {
          const world = toWorld(
            gs.moveX - originRef.current.x,
            gs.moveY - originRef.current.y
          );
          setPos((prev) => ({ ...prev, [g.id]: world }));
        } else {
          setView((v) => ({ ...v, tx: g.startTx + gs.dx, ty: g.startTy + gs.dy }));
        }
      },
      onPanResponderRelease: () => {
        if (!movedRef.current) {
          const g = gestureRef.current;
          const id = g && g.type === 'node' ? g.id : null;
          setSelected((prev) => (id === null || prev === id ? null : id));
        }
        gestureRef.current = null;
        pinchRef.current = null;
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const neighbors = selected ? graph.adjacency.get(selected) ?? new Set<string>() : null;
  const isLit = (id: string) => !selected || id === selected || neighbors?.has(id);
  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) ?? null : null;
  const pulseEdges = (
    selected ? graph.edges.filter((e) => e.a === selected || e.b === selected) : graph.edges
  ).slice(0, 8);
  const topTopic = [...graph.nodes].sort((a, b) => b.count - a.count)[0];

  return (
    <View>
      <View
        ref={containerRef}
        {...(Platform.OS !== 'web' ? { collapsable: false } : null)}
        onLayout={(e) => {
          setWidth(Math.round(e.nativeEvent.layout.width));
          containerRef.current?.measureInWindow((wx, wy) => {
            originRef.current = { x: wx, y: wy };
          });
        }}
        style={[styles.canvas, { height }]}
        {...panResponder.panHandlers}
      >
        <Svg width={width} height={height}>
          <G transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
            {graph.edges.map((e, i) => {
              const a = pos[e.a];
              const b = pos[e.b];
              if (!a || !b) return null;
              const lit = selected && (e.a === selected || e.b === selected);
              return (
                <Line
                  key={`e${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={lit ? palette.accent : palette.inkSoft}
                  strokeWidth={(lit ? 1.6 : 1) + Math.min(3, e.weight - 1)}
                  strokeOpacity={selected ? (lit ? 0.8 : 0.07) : 0.25}
                />
              );
            })}
            {pulseEdges.map((e, i) => {
              const a = pos[e.a];
              const b = pos[e.b];
              if (!a || !b) return null;
              const flip = i % 2 === 1;
              const from = flip ? b : a;
              const to = flip ? a : b;
              return (
                <AnimatedCircle
                  key={`p${i}`}
                  r={2.6}
                  fill={selected ? palette.accent : palette.gold}
                  opacity={selected ? 0.9 : 0.5}
                  cx={pulse.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] })}
                  cy={pulse.interpolate({ inputRange: [0, 1], outputRange: [from.y, to.y] })}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const lit = isLit(n.id);
              const labelSize = Math.max(
                7.5,
                Math.min(15, Math.min(n.r * 0.46, (n.r * 2 - 8) / (n.label.length * 0.62)))
              );
              return (
                <G key={n.id} opacity={lit ? 1 : 0.16}>
                  {n.id === selected && (
                    <Circle
                      cx={p.x}
                      cy={p.y}
                      r={n.r + 6}
                      fill="none"
                      stroke={palette.accent}
                      strokeWidth={2}
                      strokeOpacity={0.7}
                    />
                  )}
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={n.r}
                    fill={n.color}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                  <SvgText
                    x={p.x}
                    y={p.y + (n.r >= 22 ? -2 : labelSize * 0.35)}
                    fontSize={labelSize}
                    fontWeight="700"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {n.label}
                  </SvgText>
                  {n.r >= 22 && (
                    <SvgText
                      x={p.x}
                      y={p.y + labelSize}
                      fontSize={labelSize * 0.8}
                      fontWeight="700"
                      fill="rgba(255,255,255,0.85)"
                      textAnchor="middle"
                    >
                      {`×${n.count}`}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </G>
        </Svg>
        {/* zoom controls */}
        <View style={styles.zoomCol}>
          <Pressable
            onPress={() => zoomAt(width / 2, height / 2, 1.25)}
            style={styles.zoomBtn}
            hitSlop={6}
          >
            <Text style={styles.zoomText}>＋</Text>
          </Pressable>
          <Pressable
            onPress={() => zoomAt(width / 2, height / 2, 0.8)}
            style={styles.zoomBtn}
            hitSlop={6}
          >
            <Text style={styles.zoomText}>－</Text>
          </Pressable>
          <Pressable
            onPress={() => setView({ k: 1, tx: 0, ty: 0 })}
            style={styles.zoomBtn}
            hitSlop={6}
          >
            <Text style={[styles.zoomText, { fontSize: 13 }]}>⤢</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendNote}>circle size = how often a topic repeats</Text>
        <Pressable onPress={() => setSeed((v) => v + 1)} hitSlop={8} style={styles.shuffleBtn}>
          <Text style={styles.shuffleText}>↻ shuffle</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Tap a topic to light up what it connects to. Drag to rearrange, drag empty space to pan,
        pinch or scroll to zoom. Colors show the emotion you most feel around that topic.
      </Text>

      {selectedNode ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {selectedNode.label}
            <Text style={styles.panelKind}>
              {'  '}×{selectedNode.count} · mostly {EMOTIONS[selectedNode.dominantEmotion].label}
            </Text>
          </Text>
          {(graph.entriesByTopic.get(selectedNode.label) ?? []).slice(0, 3).map((e) => (
            <Pressable key={e.id} onPress={() => onOpenEntry(e.id)} style={styles.panelEntry}>
              <Text style={styles.panelEntryDate}>
                {new Date(e.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} ·{' '}
                {emotionMeta(e.analysis.emotion).label}
              </Text>
              <Text style={styles.panelEntryText} numberOfLines={1}>
                {e.text}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        topTopic &&
        topTopic.count > 1 && (
          <View style={styles.panel}>
            <Text style={styles.panelInsight}>
              Most repeated thought: <Text style={styles.panelBold}>{topTopic.label}</Text>, on your
              mind in {topTopic.count} entries.
            </Text>
          </View>
        )
      )}
    </View>
  );
}

// ============================================================
// EMOTION MODE: consciousness frequencies + glowing aura human
// ============================================================

function EmotionFrequencyView({ entries }: { entries: Entry[] }) {
  const [width, setWidth] = useState(320);
  const [selected, setSelected] = useState<EmotionKey | null>(null);
  const height = 430;

  const counts = useMemo(() => {
    const m = new Map<EmotionKey, number>();
    entries.forEach((e) => m.set(e.analysis.emotion, (m.get(e.analysis.emotion) ?? 0) + 1));
    return m;
  }, [entries]);

  const total = entries.length;
  const overall = Math.round(
    [...counts.entries()].reduce((s, [k, c]) => s + HAWKINS[k] * c, 0) / Math.max(1, total)
  );
  const level = consciousnessLevel(overall);

  // higher frequency floats to the top, like the consciousness cone
  const present = [...counts.entries()].sort((a, b) => HAWKINS[b[0]] - HAWKINS[a[0]]);
  const cx = width / 2;
  const cy = height * 0.46;
  const bubbles = present.map(([emotion, count], i) => {
    const n = present.length;
    const y = n === 1 ? 70 : 56 + (i * (height - 150)) / (n - 1);
    const side = i % 2 === 0 ? -1 : 1;
    const x = cx + side * (width * 0.32) + (i % 3 === 2 ? side * -22 : 0);
    const r = Math.min(40, 19 + count * 4);
    return { emotion, count, x, y, r, hz: HAWKINS[emotion] };
  });

  // tap detection (no drag needed in this mode)
  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        syncOrigin(containerRef, originRef);
        const hitAt = (ox: number, oy: number) => {
          const lx = pageX - ox;
          const ly = pageY - oy;
          return bubblesRef.current.find((b) => Math.hypot(b.x - lx, b.y - ly) < b.r + 8) ?? null;
        };
        const apply = (hit: { emotion: EmotionKey } | null) =>
          setSelected((prev) => (hit ? (prev === hit.emotion ? null : hit.emotion) : null));
        const first = hitAt(originRef.current.x, originRef.current.y);
        apply(first);
        // re-measure in case the page scrolled since layout, then re-test
        containerRef.current?.measureInWindow((wx, wy) => {
          const moved =
            Math.abs(wx - originRef.current.x) > 2 || Math.abs(wy - originRef.current.y) > 2;
          originRef.current = { x: wx, y: wy };
          if (moved) apply(hitAt(wx, wy));
        });
      },
    })
  ).current;

  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2400, useNativeDriver: false }),
        Animated.timing(breathe, { toValue: 0, duration: 2400, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const auraColor = level.color;
  const pct = frequencyPercent(overall);

  return (
    <View>
      <View
        ref={containerRef}
        {...(Platform.OS !== 'web' ? { collapsable: false } : null)}
        onLayout={(e) => {
          setWidth(Math.round(e.nativeEvent.layout.width));
          containerRef.current?.measureInWindow((wx, wy) => {
            originRef.current = { x: wx, y: wy };
          });
        }}
        style={[styles.canvas, { height }]}
        {...panResponder.panHandlers}
      >
        <Svg width={width} height={height}>
          {/* threads from each emotion to your center */}
          {bubbles.map((b) => (
            <Line
              key={`l-${b.emotion}`}
              x1={b.x}
              y1={b.y}
              x2={cx}
              y2={cy}
              stroke={EMOTIONS[b.emotion].color}
              strokeWidth={1.4}
              strokeOpacity={selected && selected !== b.emotion ? 0.06 : 0.25}
            />
          ))}
          {/* breathing aura, colored by your overall frequency */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill={auraColor}
            opacity={0.1}
            r={breathe.interpolate({ inputRange: [0, 1], outputRange: [66, 80] })}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill={auraColor}
            opacity={0.18}
            r={breathe.interpolate({ inputRange: [0, 1], outputRange: [48, 58] })}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill={auraColor}
            opacity={0.3}
            r={breathe.interpolate({ inputRange: [0, 1], outputRange: [33, 39] })}
          />
          {/* meditating human silhouette */}
          <Circle cx={cx} cy={cy - 33} r={10.5} fill={palette.ink} />
          <Path
            d={`M ${cx - 15},${cy + 12} C ${cx - 17},${cy - 14} ${cx - 9},${cy - 21} ${cx},${cy - 21} C ${cx + 9},${cy - 21} ${cx + 17},${cy - 14} ${cx + 15},${cy + 12} Z`}
            fill={palette.ink}
          />
          <Path
            d={`M ${cx - 28},${cy + 16} Q ${cx},${cy + 32} ${cx + 28},${cy + 16} Q ${cx},${cy + 4} ${cx - 28},${cy + 16} Z`}
            fill={palette.ink}
          />
          {/* emotion bubbles: name + count + frequency inside */}
          {bubbles.map((b) => {
            const meta = EMOTIONS[b.emotion];
            const dim = selected && selected !== b.emotion;
            const fs = Math.max(9, Math.min(13, b.r * 0.4));
            return (
              <G key={b.emotion} opacity={dim ? 0.25 : 1}>
                {selected === b.emotion && (
                  <Circle
                    cx={b.x}
                    cy={b.y}
                    r={b.r + 5}
                    fill="none"
                    stroke={meta.deep}
                    strokeWidth={2}
                    strokeOpacity={0.7}
                  />
                )}
                <Circle cx={b.x} cy={b.y} r={b.r} fill={meta.color} stroke="#FFF" strokeWidth={2} />
                <SvgText
                  x={b.x}
                  y={b.y - b.r * 0.18}
                  fontSize={fs}
                  fontWeight="700"
                  fill="#FFFFFF"
                  textAnchor="middle"
                >
                  {meta.label}
                </SvgText>
                <SvgText
                  x={b.x}
                  y={b.y + fs * 0.75}
                  fontSize={fs * 0.85}
                  fontWeight="700"
                  fill="rgba(255,255,255,0.9)"
                  textAnchor="middle"
                >
                  {`×${b.count}`}
                </SvgText>
                {b.r >= 26 && (
                  <SvgText
                    x={b.x}
                    y={b.y + fs * 1.85}
                    fontSize={fs * 0.72}
                    fontWeight="600"
                    fill="rgba(255,255,255,0.75)"
                    textAnchor="middle"
                  >
                    {`${b.hz} Hz`}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      {/* overall frequency readout + ladder */}
      <View style={styles.auraPanel}>
        <Text style={styles.auraTitle}>
          Your aura resonates at <Text style={[styles.auraValue, { color: auraColor }]}>{overall}</Text>
          {'  ·  '}
          <Text style={[styles.auraLevel, { color: auraColor }]}>{level.label}</Text>
        </Text>
        <View style={styles.ladder}>
          {CONSCIOUSNESS_LEVELS.map((l) => (
            <View key={l.min} style={{ flex: 1, backgroundColor: l.color, height: 10 }} />
          ))}
          <View style={[styles.ladderMarker, { left: `${Math.round(pct * 100)}%` }]} />
        </View>
        <View style={styles.ladderLabels}>
          <Text style={styles.ladderLabel}>Shame 20</Text>
          <Text style={styles.ladderLabel}>Courage 200</Text>
          <Text style={styles.ladderLabel}>Peace 700</Text>
        </View>
        <Text style={styles.auraNote}>
          {selected
            ? `${EMOTIONS[selected].label}: felt ${counts.get(selected)} ${
                (counts.get(selected) ?? 0) === 1 ? 'time' : 'times'
              }, resonating at ${HAWKINS[selected]} on the consciousness scale.`
            : 'Weighted by every entry you have written. Higher emotions lift the whole field.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    backgroundColor: palette.line,
    borderRadius: 999,
    padding: 3,
    gap: 4,
    marginBottom: 10,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  modeBtnActive: { backgroundColor: palette.card },
  modeBtnText: { fontWeight: '700', color: palette.inkSoft, fontSize: 13 },
  modeBtnTextActive: { color: palette.ink },
  canvas: {
    borderRadius: 18,
    backgroundColor: palette.bg,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none' } as object) : null),
  },
  emptyText: { color: palette.inkSoft, fontSize: 14 },
  zoomCol: { position: 'absolute', right: 8, top: 8, gap: 6 },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 8px rgba(58,51,64,0.15)' } as object)
      : { elevation: 3 }),
  },
  zoomText: { fontSize: 15, fontWeight: '800', color: palette.ink, lineHeight: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendNote: { fontSize: 11.5, fontWeight: '600', color: palette.inkSoft, flex: 1 },
  shuffleBtn: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  shuffleText: { fontSize: 12, fontWeight: '700', color: palette.accent },
  hint: { fontSize: 11.5, color: palette.inkFaint, marginTop: 8, lineHeight: 16 },
  panel: { marginTop: 12, backgroundColor: palette.bg, borderRadius: 16, padding: 14 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, textTransform: 'capitalize' },
  panelKind: { fontSize: 12, fontWeight: '600', color: palette.inkSoft, textTransform: 'none' },
  panelEntry: { marginTop: 10 },
  panelEntryDate: { fontSize: 11, fontWeight: '800', color: palette.accent },
  panelEntryText: { fontSize: 13, color: palette.inkSoft, marginTop: 2 },
  panelInsight: { fontSize: 13, lineHeight: 19, color: palette.inkSoft, fontStyle: 'italic' },
  panelBold: { fontWeight: '800', color: palette.accent, fontStyle: 'normal' },
  auraPanel: { marginTop: 12, backgroundColor: palette.bg, borderRadius: 16, padding: 14 },
  auraTitle: { fontSize: 14, fontWeight: '700', color: palette.ink, textAlign: 'center' },
  auraValue: { fontSize: 18, fontWeight: '900' },
  auraLevel: { fontWeight: '800' },
  ladder: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 12,
  },
  ladderMarker: {
    position: 'absolute',
    top: -3,
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: palette.ink,
    marginLeft: -2,
  },
  ladderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  ladderLabel: { fontSize: 10, fontWeight: '600', color: palette.inkFaint },
  auraNote: {
    fontSize: 12,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
