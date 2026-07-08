import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Entry, EmotionKey } from '../types';
import { palette, readableTextOn, shadeHex, tintHex } from '../theme';
import {
  auraColor as auraColorFor,
  CONSCIOUSNESS_LEVELS,
  consciousnessLevel,
  EMOTION_KEYS,
  EMOTIONS,
  frequencyColor,
  frequencyPercent,
  HAWKINS,
} from '../emotions';
import { AuraGuidance, explainAura } from '../ai';
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
  apiKey: string;
  onOpenEntry: (id: string) => void;
}

export default function KnowledgeGraph({ entries, apiKey }: Props) {
  if (entries.length === 0) {
    return (
      <Text style={styles.emptyText}>Your mind graph will grow here as you write entries.</Text>
    );
  }

  return <EmotionFrequencyView entries={entries} apiKey={apiKey} />;
}

// ============================================================
// EMOTION MODE: consciousness frequencies + glowing aura
// ============================================================

function EmotionFrequencyView({ entries, apiKey }: { entries: Entry[]; apiKey: string }) {
  const [width, setWidth] = useState(320);
  const [selected, setSelected] = useState<EmotionKey | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [howData, setHowData] = useState<AuraGuidance | null>(null);
  const [howLoading, setHowLoading] = useState(false);
  const howSigRef = useRef('');
  const height = 440;

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
    const y = n === 1 ? 70 : 56 + (i * (height - 156)) / (n - 1);
    const side = i % 2 === 0 ? -1 : 1;
    const x = cx + side * (width * 0.32) + (i % 3 === 2 ? side * -22 : 0);
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
        Animated.timing(breathe, { toValue: 1, duration: 2800, useNativeDriver: false }),
        Animated.timing(breathe, { toValue: 0, duration: 2800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // The aura is the blend of the actual emotion colors felt, so it truly
  // represents the mix of frequencies (mostly Joy reads gold, Love reads pink).
  const aura = auraColorFor(counts);
  const auraInk = shadeHex(aura, 0.28);
  const pct = frequencyPercent(overall);

  // "how?" : explain why the aura sits at this level, from the whole journal.
  // Cached by a signature so tapping again does not re-spend tokens.
  const howSig = `${entries.length}:${overall}`;
  const openHow = () => {
    const next = !howOpen;
    setHowOpen(next);
    if (next && howSigRef.current !== howSig && !howLoading) {
      setHowLoading(true);
      explainAura(entries, apiKey)
        .then((data) => {
          setHowData(data);
          howSigRef.current = howSig;
        })
        .catch(() =>
          setHowData({
            purpose: '',
            why: 'Could not generate this right now. Try again.',
            raise: [],
          })
        )
        .finally(() => setHowLoading(false));
    }
  };

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
          <Defs>
            <RadialGradient id="bg" cx="50%" cy="44%" r="72%">
              <Stop offset="0" stopColor={tintHex(aura, 0.74)} stopOpacity="1" />
              <Stop offset="1" stopColor={palette.bg} stopOpacity="1" />
            </RadialGradient>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={aura} stopOpacity="0.55" />
              <Stop offset="0.6" stopColor={aura} stopOpacity="0.22" />
              <Stop offset="1" stopColor={aura} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* soft tinted background washed by your aura color */}
          <Rect x={0} y={0} width={width} height={height} fill="url(#bg)" />

          {/* threads from each emotion to your center */}
          {bubbles.map((b) => (
            <Line
              key={`l-${b.emotion}`}
              x1={b.x}
              y1={b.y}
              x2={cx}
              y2={cy}
              stroke={frequencyColor(b.hz)}
              strokeWidth={1.6}
              strokeOpacity={selected && selected !== b.emotion ? 0.05 : 0.3}
            />
          ))}

          {/* breathing aura halo (gradient) + a faint guide ring */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill="url(#halo)"
            r={breathe.interpolate({ inputRange: [0, 1], outputRange: [80, 96] })}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            fill={aura}
            opacity={0.32}
            r={breathe.interpolate({ inputRange: [0, 1], outputRange: [34, 41] })}
          />
          <Circle cx={cx} cy={cy} r={70} fill="none" stroke={aura} strokeOpacity={0.25} strokeWidth={1} />

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
            // colored by its place on the consciousness spectrum, so the hue
            // matches the frequency (fear warm-orange, joy/peace violet)
            const fill = frequencyColor(b.hz);
            const deep = shadeHex(fill, 0.35);
            const tcol = readableTextOn(fill);
            return (
              <G key={b.emotion} opacity={dim ? 0.22 : 1}>
                {/* soft drop shadow for depth */}
                <Circle cx={b.x} cy={b.y + 3} r={b.r} fill={deep} opacity={0.18} />
                {selected === b.emotion && (
                  <Circle
                    cx={b.x}
                    cy={b.y}
                    r={b.r + 5}
                    fill="none"
                    stroke={deep}
                    strokeWidth={2.5}
                    strokeOpacity={0.85}
                  />
                )}
                <Circle cx={b.x} cy={b.y} r={b.r} fill={fill} stroke="#FFF" strokeWidth={2} />
                {/* glossy highlight */}
                <Ellipse
                  cx={b.x - b.r * 0.28}
                  cy={b.y - b.r * 0.4}
                  rx={b.r * 0.42}
                  ry={b.r * 0.24}
                  fill="#FFFFFF"
                  opacity={0.22}
                />
                <SvgText
                  x={b.x}
                  y={b.y - b.r * 0.28}
                  fontSize={fs}
                  fontWeight="700"
                  fill={tcol}
                  textAnchor="middle"
                >
                  {meta.label}
                </SvgText>
                <SvgText
                  x={b.x}
                  y={b.y + fs * 0.5}
                  fontSize={fs * 0.85}
                  fontWeight="700"
                  fill={tcol}
                  fillOpacity={0.92}
                  textAnchor="middle"
                >
                  {`×${b.count}`}
                </SvgText>
                <SvgText
                  x={b.x}
                  y={b.y + b.r * 0.62}
                  fontSize={fs * 0.72}
                  fontWeight="600"
                  fill={tcol}
                  fillOpacity={0.8}
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
        <View style={styles.auraTitleRow}>
          <Text style={[styles.auraTitle, { flex: 1, textAlign: 'left' }]}>
            Your aura resonates at{' '}
            <Text style={[styles.auraValue, { color: auraInk }]}>{overall}</Text> Hz
            {'  ·  '}
            <Text style={[styles.auraLevel, { color: auraInk }]}>{level.label}</Text>
          </Text>
          <Pressable onPress={openHow} style={styles.howBtn} hitSlop={8}>
            <Text style={styles.howBtnText}>{howOpen ? 'hide' : 'why?'}</Text>
          </Pressable>
        </View>
        {howOpen && (
          <View style={styles.howPanel}>
            {howLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <ActivityIndicator color={palette.accent} />
                <Text style={styles.howLoadingText}>reading your field…</Text>
              </View>
            ) : howData ? (
              <>
                {!!howData.purpose && <Text style={styles.howPurpose}>{howData.purpose}</Text>}
                <Text style={styles.howHead}>Why your aura sits here</Text>
                <Text style={styles.howText}>{howData.why}</Text>
                {howData.raise.length > 0 && (
                  <>
                    <Text style={styles.howHead}>Lift your frequency</Text>
                    {howData.raise.map((r, i) => (
                      <Text key={i} style={styles.howItem}>{`✧  ${r}`}</Text>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.howText}>…</Text>
            )}
          </View>
        )}
        <Pressable onPress={() => setShowLegend((v) => !v)}>
          <View style={styles.ladder}>
            {CONSCIOUSNESS_LEVELS.map((l) => (
              <View key={l.min} style={{ flex: 1, backgroundColor: l.color, height: 12 }} />
            ))}
            <View style={[styles.ladderMarker, { left: `${Math.round(pct * 100)}%` }]} />
          </View>
          <View style={styles.ladderLabels}>
            <Text style={styles.ladderLabel}>Shame 20</Text>
            <Text style={styles.ladderLabel}>Courage 200</Text>
            <Text style={styles.ladderLabel}>Enlightenment 700</Text>
          </View>
          <Text style={styles.ladderHint}>
            {showLegend ? '▲  tap to hide the spectrum key' : '▼  tap to see which color each emotion carries'}
          </Text>
        </Pressable>

        {showLegend && (
          <View style={styles.legend}>
            {[...EMOTION_KEYS]
              .sort((a, b) => HAWKINS[b] - HAWKINS[a])
              .map((k) => {
                const c = frequencyColor(HAWKINS[k]);
                const lvl = consciousnessLevel(HAWKINS[k]);
                return (
                  <View key={k} style={styles.legendRow}>
                    <View style={[styles.legendSwatch, { backgroundColor: c }]} />
                    <Text style={styles.legendName}>{EMOTIONS[k].label}</Text>
                    <Text style={styles.legendMeta}>
                      {HAWKINS[k]} Hz · {lvl.label}
                    </Text>
                  </View>
                );
              })}
          </View>
        )}
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
    borderRadius: 20,
    backgroundColor: palette.bg,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'none' } as object) : null),
  },
  emptyText: { color: palette.inkSoft, fontSize: 14 },
  auraPanel: { marginTop: 12, backgroundColor: palette.bg, borderRadius: 16, padding: 14 },
  auraTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  auraTitle: { fontSize: 14, fontWeight: '700', color: palette.ink, textAlign: 'center' },
  howBtn: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  howBtnText: { fontSize: 12, fontWeight: '800', color: palette.accent },
  howPanel: {
    marginTop: 10,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    minHeight: 40,
  },
  howLoadingText: { fontSize: 12, color: palette.inkSoft, fontStyle: 'italic', marginTop: 8 },
  howPurpose: {
    fontSize: 13.5,
    lineHeight: 21,
    color: palette.accentDeep,
    fontWeight: '600',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  howHead: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.inkFaint,
    marginTop: 10,
    marginBottom: 4,
  },
  howText: { fontSize: 13, lineHeight: 20, color: palette.ink },
  howItem: { fontSize: 13, lineHeight: 20, color: palette.ink, marginTop: 3 },
  auraValue: { fontSize: 19, fontWeight: '900' },
  auraLevel: { fontWeight: '800' },
  ladder: {
    flexDirection: 'row',
    borderRadius: 7,
    overflow: 'hidden',
    marginTop: 14,
  },
  ladderMarker: {
    position: 'absolute',
    top: -3,
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: palette.ink,
    marginLeft: -2,
  },
  ladderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  ladderLabel: { fontSize: 10, fontWeight: '600', color: palette.inkFaint },
  ladderHint: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.accent,
    textAlign: 'center',
    marginTop: 8,
  },
  legend: {
    marginTop: 10,
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendSwatch: { width: 18, height: 18, borderRadius: 5 },
  legendName: { fontSize: 13, fontWeight: '800', color: palette.ink, width: 86 },
  legendMeta: { fontSize: 12, fontWeight: '600', color: palette.inkSoft },
  auraNote: {
    fontSize: 12,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
