import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
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
  frequencyPercent,
  HAWKINS,
} from '../emotions';
import { Point } from '../graph';

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

export default function KnowledgeGraph({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <Text style={styles.emptyText}>Your mind graph will grow here as you write entries.</Text>
    );
  }

  return <EmotionFrequencyView entries={entries} />;
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
    // min radius keeps every bubble big enough to show name + count + Hz
    const r = Math.min(42, 22 + count * 4);
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
          {/* you, at the calm center of your own field */}
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
                  y={b.y - b.r * 0.28}
                  fontSize={fs}
                  fontWeight="700"
                  fill="#FFFFFF"
                  textAnchor="middle"
                >
                  {meta.label}
                </SvgText>
                <SvgText
                  x={b.x}
                  y={b.y + fs * 0.5}
                  fontSize={fs * 0.85}
                  fontWeight="700"
                  fill="rgba(255,255,255,0.9)"
                  textAnchor="middle"
                >
                  {`×${b.count}`}
                </SvgText>
                <SvgText
                  x={b.x}
                  y={b.y + b.r * 0.62}
                  fontSize={fs * 0.72}
                  fontWeight="600"
                  fill="rgba(255,255,255,0.78)"
                  textAnchor="middle"
                >
                  {`${b.hz} Hz`}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>

      {/* overall frequency readout + ladder */}
      <View style={styles.auraPanel}>
        <Text style={styles.auraTitle}>
          Your aura resonates at{' '}
          <Text style={[styles.auraValue, { color: auraColor }]}>{overall}</Text> Hz
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
              }, resonating at ${HAWKINS[selected]} Hz on the consciousness scale.`
            : 'Weighted by every entry you have written. Higher emotions lift the whole field.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    borderRadius: 18,
    backgroundColor: palette.bg,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none' } as object) : null),
  },
  emptyText: { color: palette.inkSoft, fontSize: 14 },
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
