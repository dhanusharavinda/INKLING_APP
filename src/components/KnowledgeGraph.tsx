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
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { Entry } from '../types';
import { palette } from '../theme';
import { emotionMeta } from '../emotions';
import { buildGraph, GraphNode, layoutGraph, Point } from '../graph';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const GRAPH_HEIGHT = 360;

interface Props {
  entries: Entry[];
  onOpenEntry: (id: string) => void;
}

// Interactive mind graph: emotions, themes, philosophers and entries as a
// living network. Tap a node to explore its connections, drag to rearrange.
export default function KnowledgeGraph({ entries, onOpenEntry }: Props) {
  const [width, setWidth] = useState(320);
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [pos, setPos] = useState<Record<string, Point>>({});

  const data = useMemo(() => buildGraph(entries), [entries]);
  const basePos = useMemo(
    () => layoutGraph(data, width, GRAPH_HEIGHT, seed),
    [data, width, seed]
  );

  useEffect(() => {
    setPos(basePos);
    setSelected(null);
  }, [basePos]);

  // refs so the PanResponder always sees current values
  const posRef = useRef(pos);
  posRef.current = pos;
  const dataRef = useRef(data);
  dataRef.current = data;
  const widthRef = useRef(width);
  widthRef.current = width;

  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const dragIdRef = useRef<string | null>(null);
  const movedRef = useRef(false);

  const findNode = (x: number, y: number): string | null => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const n of dataRef.current.nodes) {
      const p = posRef.current[n.id];
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < n.r + 14 && d < bestDist) {
        best = n.id;
        bestDist = d;
      }
    }
    return best;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        movedRef.current = false;
        // hit test immediately with the last known origin so a quick tap registers
        dragIdRef.current = findNode(pageX - originRef.current.x, pageY - originRef.current.y);
        // then re-measure (the container may have scrolled) and refine
        containerRef.current?.measureInWindow((wx, wy) => {
          originRef.current = { x: wx, y: wy };
          dragIdRef.current = findNode(pageX - wx, pageY - wy);
        });
      },
      onPanResponderMove: (_evt, gs) => {
        if (Math.abs(gs.dx) + Math.abs(gs.dy) > 6) movedRef.current = true;
        const id = dragIdRef.current;
        if (!id || !movedRef.current) return;
        const x = gs.moveX - originRef.current.x;
        const y = gs.moveY - originRef.current.y;
        setPos((prev) => ({
          ...prev,
          [id]: {
            x: Math.max(18, Math.min(widthRef.current - 18, x)),
            y: Math.max(18, Math.min(GRAPH_HEIGHT - 18, y)),
          },
        }));
      },
      onPanResponderRelease: () => {
        if (!movedRef.current) {
          const id = dragIdRef.current;
          setSelected((prev) => (id === null || prev === id ? null : id));
        }
        dragIdRef.current = null;
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // slow pulse traveling along highlighted edges, for the neural feel
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const neighbors = selected ? data.adjacency.get(selected) ?? new Set<string>() : null;
  const isLit = (id: string) => !selected || id === selected || neighbors?.has(id);

  const selectedNode = selected ? data.nodes.find((n) => n.id === selected) ?? null : null;
  const pulseEdges = (
    selected
      ? data.edges.filter((e) => e.a === selected || e.b === selected)
      : data.edges
  ).slice(0, 8);

  // the theme that ties the most entries together
  const topTheme = data.nodes
    .filter((n) => n.kind === 'theme')
    .sort((a, b) => b.count - a.count)[0];

  if (data.nodes.length === 0) {
    return (
      <Text style={styles.emptyText}>
        Your mind graph will grow here as you write entries.
      </Text>
    );
  }

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
        style={styles.canvas}
        {...panResponder.panHandlers}
      >
        <Svg width={width} height={GRAPH_HEIGHT}>
          {/* edges */}
          {data.edges.map((e, i) => {
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
                strokeWidth={lit ? 1.8 : 1}
                strokeOpacity={selected ? (lit ? 0.85 : 0.08) : 0.22}
              />
            );
          })}
          {/* signal pulses along edges */}
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
                r={2.4}
                fill={selected ? palette.accent : palette.gold}
                opacity={selected ? 0.9 : 0.5}
                cx={pulse.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] })}
                cy={pulse.interpolate({ inputRange: [0, 1], outputRange: [from.y, to.y] })}
              />
            );
          })}
          {/* nodes */}
          {data.nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const lit = isLit(n.id);
            const showLabel = n.kind !== 'entry' && (lit || !selected);
            return (
              <G key={n.id} opacity={lit ? 1 : 0.18}>
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
                  fillOpacity={n.kind === 'entry' ? 0.8 : 0.95}
                  stroke="#FFFFFF"
                  strokeWidth={n.kind === 'entry' ? 1 : 2}
                />
                {showLabel && (
                  <SvgText
                    x={p.x}
                    y={p.y - n.r - 6}
                    fontSize={n.kind === 'emotion' ? 12 : 10.5}
                    fontWeight="700"
                    fill={palette.ink}
                    textAnchor="middle"
                  >
                    {n.label}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      {/* legend + controls */}
      <View style={styles.legendRow}>
        <LegendDot color={emotionMeta('joy').color} label="emotion" />
        <LegendDot color={palette.accent} label="theme" />
        <LegendDot color={palette.gold} label="philosopher" />
        <LegendDot color={palette.inkFaint} label="entry" small />
        <Pressable onPress={() => setSeed((v) => v + 1)} hitSlop={8} style={styles.shuffleBtn}>
          <Text style={styles.shuffleText}>↻ shuffle</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Tap a node to light up its connections. Drag nodes to rearrange.
        {data.truncated > 0 ? ' Showing your 30 most recent entries.' : ''}
      </Text>

      {/* detail panel for the selected node */}
      {selectedNode && (
        <View style={styles.panel}>
          <NodePanel node={selectedNode} data={data} entries={entries} onOpenEntry={onOpenEntry} />
        </View>
      )}
      {!selectedNode && topTheme && topTheme.count > 1 && (
        <View style={styles.panel}>
          <Text style={styles.panelInsight}>
            Strongest thread: <Text style={styles.panelBold}>{topTheme.label}</Text>, woven through{' '}
            {topTheme.count} entries.
          </Text>
        </View>
      )}
    </View>
  );
}

function LegendDot({ color, label, small }: { color: string; label: string; small?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={{
          width: small ? 8 : 12,
          height: small ? 8 : 12,
          borderRadius: 6,
          backgroundColor: color,
        }}
      />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function NodePanel({
  node,
  data,
  entries,
  onOpenEntry,
}: {
  node: GraphNode;
  data: ReturnType<typeof buildGraph>;
  entries: Entry[];
  onOpenEntry: (id: string) => void;
}) {
  const neighborIds = data.adjacency.get(node.id) ?? new Set<string>();
  const neighborNodes = data.nodes.filter((n) => neighborIds.has(n.id));
  const linkedEntries = neighborNodes.filter((n) => n.kind === 'entry').length;

  if (node.kind === 'entry') {
    const entry = entries.find((e) => e.id === node.entryId);
    if (!entry) return null;
    return (
      <View>
        <Text style={styles.panelTitle}>
          {new Date(entry.createdAt).toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}{' '}
          · {emotionMeta(entry.analysis.emotion).label}
        </Text>
        <Text style={styles.panelBody} numberOfLines={2}>
          {entry.text}
        </Text>
        <Pressable onPress={() => onOpenEntry(entry.id)} style={styles.openBtn}>
          <Text style={styles.openBtnText}>Open entry →</Text>
        </Pressable>
      </View>
    );
  }

  const links = neighborNodes
    .filter((n) => n.kind !== 'entry')
    .map((n) => n.label)
    .slice(0, 6);

  return (
    <View>
      <Text style={styles.panelTitle}>
        {node.kind === 'philosopher' ? `${node.label}${node.school ? ` · ${node.school}` : ''}` : node.label}
        <Text style={styles.panelKind}>  ({node.kind})</Text>
      </Text>
      <Text style={styles.panelBody}>
        Appears in {linkedEntries} {linkedEntries === 1 ? 'entry' : 'entries'}
        {links.length > 0 ? `, connected with ${links.join(', ')}.` : '.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: GRAPH_HEIGHT,
    borderRadius: 18,
    backgroundColor: palette.bg,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'none' } as object) : null),
  },
  emptyText: { color: palette.inkSoft, fontSize: 14 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLabel: { fontSize: 11, fontWeight: '600', color: palette.inkSoft },
  shuffleBtn: {
    marginLeft: 'auto',
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  shuffleText: { fontSize: 12, fontWeight: '700', color: palette.accent },
  hint: { fontSize: 11.5, color: palette.inkFaint, marginTop: 8, lineHeight: 16 },
  panel: {
    marginTop: 12,
    backgroundColor: palette.bg,
    borderRadius: 16,
    padding: 14,
  },
  panelTitle: { fontSize: 14, fontWeight: '800', color: palette.ink },
  panelKind: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  panelBody: { fontSize: 13, lineHeight: 19, color: palette.inkSoft, marginTop: 5 },
  panelInsight: { fontSize: 13, lineHeight: 19, color: palette.inkSoft, fontStyle: 'italic' },
  panelBold: { fontWeight: '800', color: palette.accent, fontStyle: 'normal' },
  openBtn: { marginTop: 10, alignSelf: 'flex-start' },
  openBtnText: { fontSize: 13, fontWeight: '800', color: palette.accent },
});
