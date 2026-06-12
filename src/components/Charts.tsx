import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

// 14-day strip: one dot per day, colored by that day's dominant emotion.
export function MoodTimeline({ entries }: { entries: Entry[] }) {
  const byDay = new Map<string, Entry[]>();
  entries.forEach((e) => {
    const k = dayKey(e.createdAt);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  });

  const days: { label: string; emotion: EmotionKey | null }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = dayKey(d.getTime());
    const dayEntries = byDay.get(k) ?? [];
    let emotion: EmotionKey | null = null;
    if (dayEntries.length > 0) {
      // dominant = highest intensity that day
      emotion = dayEntries.reduce((a, b) =>
        a.analysis.intensity >= b.analysis.intensity ? a : b
      ).analysis.emotion;
    }
    days.push({
      label: 'SMTWTFS'[d.getDay()],
      emotion,
    });
  }

  return (
    <View style={styles.timelineRow}>
      {days.map((d, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 4 }}>
          <View
            style={[
              styles.dot,
              d.emotion
                ? { backgroundColor: EMOTIONS[d.emotion].color }
                : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: palette.line },
            ]}
          />
          <Text style={styles.dotLabel}>{d.label}</Text>
        </View>
      ))}
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
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dotLabel: {
    fontSize: 10,
    color: palette.inkFaint,
    fontWeight: '600',
  },
  empty: {
    color: palette.inkSoft,
    fontSize: 14,
  },
});
