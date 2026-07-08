import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Entry, EmotionKey } from '../types';
import { EMOTIONS, EMOTION_KEYS } from '../emotions';
import { palette } from '../theme';
import { dayKey } from '../gamification';
import EmotionAvatar from './EmotionAvatar';

// Horizontal bars: how often each emotion appears.
export function EmotionDistribution({ entries }: { entries: Entry[] }) {
  const counts: Record<EmotionKey, number> = Object.fromEntries(
    EMOTION_KEYS.map((k) => [k, 0])
  ) as Record<EmotionKey, number>;
  entries.forEach((e) => {
    counts[e.analysis.emotion] += 1;
  });
  const max = Math.max(1, ...Object.values(counts));
  const ranked = EMOTION_KEYS.filter((k) => counts[k] > 0).sort((a, b) => counts[b] - counts[a]);

  if (ranked.length === 0) {
    return <Text style={styles.empty}>No emotions captured yet. Write your first entry.</Text>;
  }

  return (
    <View style={{ gap: 10 }}>
      {ranked.map((k) => {
        const meta = EMOTIONS[k];
        return (
          <View key={k} style={styles.row}>
            <View style={{ width: 34, alignItems: 'center' }}>
              <EmotionAvatar emotion={k} size={30} />
            </View>
            <Text style={styles.barLabel}>{meta.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={{
                  width: `${Math.round((counts[k] / max) * 100)}%`,
                  minWidth: 10,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: meta.color,
                }}
              />
            </View>
            <Text style={styles.barCount}>{counts[k]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const ROW_LABELS = ['', 'M', '', 'W', '', 'F', '']; // weekday rows (Sun=0), minimal
const CELL_MAX = 15; // keep the grid small

interface Cell {
  key: string;
  inMonth: boolean;
  future: boolean;
  emotion: EmotionKey | null;
  intensity: number;
}

// One calendar month, GitHub-style (week columns, weekday rows), kept small.
// Swipe left/right or tap the arrows to move between months.
export function MoodMonthGrid({ entries }: { entries: Entry[] }) {
  const [width, setWidth] = useState(300);
  const [offset, setOffset] = useState(0); // 0 = current month, negative = past

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    entries.forEach((e) => {
      const k = dayKey(e.createdAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return m;
  }, [entries]);

  const now = new Date();
  const todayKey = dayKey(now.getTime());
  const view = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const numCols = Math.ceil((firstDow + daysInMonth) / 7);

  const weeks: Cell[][] = [];
  for (let w = 0; w < numCols; w++) {
    const col: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const dayNum = w * 7 + d - firstDow + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        col.push({ key: `pad-${w}-${d}`, inMonth: false, future: false, emotion: null, intensity: 0 });
        continue;
      }
      const date = new Date(year, month, dayNum);
      const k = dayKey(date.getTime());
      const future = date.getTime() > now.getTime() && k !== todayKey;
      const dayEntries = byDay.get(k) ?? [];
      let emotion: EmotionKey | null = null;
      let intensity = 0;
      if (dayEntries.length > 0) {
        const dom = dayEntries.reduce((a, b) => {
          if (b.analysis.intensity !== a.analysis.intensity)
            return b.analysis.intensity > a.analysis.intensity ? b : a;
          return b.createdAt > a.createdAt ? b : a; // stable tiebreak
        });
        emotion = dom.analysis.emotion;
        intensity = dom.analysis.intensity;
      }
      col.push({ key: k, inMonth: true, future, emotion, intensity });
    }
    weeks.push(col);
  }

  const labelW = 16;
  const gap = 4;
  const fit = Math.floor((width - labelW - (numCols - 1) * gap) / numCols);
  const cell = Math.max(11, Math.min(CELL_MAX, fit));
  const cellRadius = Math.max(3, Math.round(cell * 0.28));
  const gridW = labelW + numCols * cell + (numCols - 1) * gap;

  const canNext = offset < 0;
  const go = (delta: number) => setOffset((o) => Math.min(0, o + delta));

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > 40) go(-1);
        else if (g.dx < -40) go(1);
      },
    })
  ).current;

  const monthLabel = view.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.gridHeaderRow}>
        <Pressable onPress={() => go(-1)} hitSlop={10} style={styles.arrowBtn}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.gridMonth}>{monthLabel}</Text>
        <Pressable onPress={() => canNext && go(1)} hitSlop={10} style={styles.arrowBtn}>
          <Text style={[styles.arrow, !canNext && { opacity: 0.25 }]}>›</Text>
        </Pressable>
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', width: gridW }} {...pan.panHandlers}>
          <View style={{ width: labelW, gap }}>
            {ROW_LABELS.map((l, i) => (
              <View key={i} style={{ height: cell, justifyContent: 'center' }}>
                <Text style={styles.weekdayLabel}>{l}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap }}>
            {weeks.map((col, wi) => (
              <View key={wi} style={{ gap }}>
                {col.map((c) => {
                  if (!c.inMonth || c.future) {
                    return <View key={c.key} style={{ width: cell, height: cell }} />;
                  }
                  const isToday = c.key === todayKey;
                  const filled = c.emotion != null;
                  const opacity = filled ? 0.45 + 0.55 * (c.intensity / 100) : 1;
                  return (
                    <View
                      key={c.key}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: cellRadius,
                        backgroundColor: filled ? EMOTIONS[c.emotion as EmotionKey].color : palette.line,
                        opacity,
                        borderWidth: isToday ? 1.5 : 0,
                        borderColor: palette.ink,
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
      <Text style={styles.gridHint}>swipe to change months</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 64,
    fontSize: 13,
    fontWeight: '600',
    color: palette.ink,
  },
  barTrack: {
    flex: 1,
    justifyContent: 'center',
  },
  barCount: {
    width: 22,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: palette.inkSoft,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 10,
  },
  gridMonth: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.ink,
    minWidth: 124,
    textAlign: 'center',
  },
  arrowBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  arrow: { fontSize: 20, fontWeight: '800', color: palette.accent, lineHeight: 22 },
  weekdayLabel: { fontSize: 8.5, color: palette.inkFaint, fontWeight: '700' },
  gridHint: {
    fontSize: 10,
    color: palette.inkFaint,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  empty: {
    color: palette.inkSoft,
    fontSize: 14,
  },
});
