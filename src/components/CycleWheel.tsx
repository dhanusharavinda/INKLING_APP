import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { CycleNow, CycleStats, LUTEAL_DAYS, PMS_DAYS, Phase, phaseMeta } from '../cycle';
import { palette, serif } from '../theme';

// Her cycle as a ring: day one at the top, the phases laid out clockwise in
// the proportions HER history actually shows, and a marker for today. The
// arcs are computed from the learned cycle length, so a 34-day cycle draws a
// visibly longer follicular stretch than a 26-day one.

const SIZE = 240;
const C = SIZE / 2;
const R_OUT = 104;
const R_IN = 76;

function polar(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

// One donut wedge between two angles.
function wedge(startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle;
  if (sweep <= 0.01) return '';
  // a full ring cannot be drawn as one arc: nudge it just under 360
  const end = sweep >= 359.9 ? startAngle + 359.9 : endAngle;
  const large = end - startAngle > 180 ? 1 : 0;
  const o1 = polar(R_OUT, startAngle);
  const o2 = polar(R_OUT, end);
  const i2 = polar(R_IN, end);
  const i1 = polar(R_IN, startAngle);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${R_IN} ${R_IN} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

interface Band {
  phase: Phase;
  from: number; // 1-based day of cycle, inclusive
  to: number;
}

// The phase layout for a cycle of this length, in day numbers.
export function phaseBands(stats: CycleStats): Band[] {
  const len = Math.max(18, stats.cycleLength);
  const period = Math.max(1, Math.min(10, stats.periodLength));
  // counted back from the NEXT period (cycle day len + 1), matching how
  // cycleNow places ovulation; counting forward would sit a day early
  const ovulation = Math.max(period + 2, len + 1 - LUTEAL_DAYS);
  const pmsFrom = Math.max(ovulation + 2, len - PMS_DAYS + 1);
  const bands: Band[] = [
    { phase: 'menstrual', from: 1, to: period },
    { phase: 'follicular', from: period + 1, to: ovulation - 2 },
    { phase: 'ovulation', from: ovulation - 1, to: ovulation + 1 },
    { phase: 'luteal', from: ovulation + 2, to: pmsFrom - 1 },
    { phase: 'pms', from: pmsFrom, to: len },
  ];
  return bands.filter((b) => b.to >= b.from);
}

interface Props {
  stats: CycleStats;
  now: CycleNow;
  partnerLabel: string; // whose cycle this is, for the caption
}

export default function CycleWheel({ stats, now, partnerLabel }: Props) {
  const len = Math.max(18, stats.cycleLength);
  const bands = phaseBands(stats);
  const meta = phaseMeta(now.phase);
  const angleFor = (day: number) => ((day - 1) / len) * 360;

  const today = now.dayOfCycle;
  const marker =
    today !== null && today >= 1 && today <= len ? polar((R_OUT + R_IN) / 2, angleFor(today) + 180 / len) : null;

  const centerTop =
    now.phase === 'unknown'
      ? 'day —'
      : today !== null && today > len
      ? `day ${today}`
      : `day ${today ?? 1}`;

  const centerSub =
    now.phase === 'unknown'
      ? 'not tracking yet'
      : now.onPeriod
      ? 'bleeding'
      : now.daysUntilNext !== null && now.daysUntilNext >= 0
      ? now.daysUntilNext === 0
        ? 'due today'
        : `${now.daysUntilNext}d to go`
      : `${Math.abs(now.daysUntilNext ?? 0)}d late`;

  return (
    <View style={styles.wrap}>
      <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* the track under everything, so a short band never leaves a gap */}
        <Circle cx={C} cy={C} r={(R_OUT + R_IN) / 2} stroke="#F3ECEF" strokeWidth={R_OUT - R_IN} fill="none" />
        <G>
          {bands.map((b) => {
            const pm = phaseMeta(b.phase);
            const active = b.phase === now.phase;
            return (
              <Path
                key={b.phase}
                d={wedge(angleFor(b.from), angleFor(b.to + 1))}
                fill={pm.color}
                opacity={active ? 1 : 0.32}
              />
            );
          })}
        </G>
        {marker && (
          <>
            <Circle cx={marker.x} cy={marker.y} r={11} fill="#FFFFFF" opacity={0.95} />
            <Circle cx={marker.x} cy={marker.y} r={7} fill={meta.color} />
          </>
        )}
      </Svg>
        {/* the readout sits over the ring as real text: SVG text renders with
            different metrics on web, and this keeps the app's own fonts */}
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerDay}>{centerTop}</Text>
          <Text style={[styles.centerPhase, { color: meta.color }]}>
            {meta.emoji} {meta.label}
          </Text>
          <Text style={styles.centerSub}>{centerSub}</Text>
        </View>
      </View>
      <Text style={styles.caption}>
        {partnerLabel} · {stats.learned ? `${stats.cycleLength}-day cycle` : 'learning the rhythm'}
        {stats.learned && !stats.regular ? ' · varies a lot' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch' },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDay: { fontFamily: serif, fontSize: 30, fontWeight: '700', color: palette.ink },
  centerPhase: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  centerSub: { fontSize: 11.5, color: palette.inkFaint, marginTop: 3 },
  caption: {
    fontFamily: serif,
    fontSize: 12.5,
    color: palette.inkSoft,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
