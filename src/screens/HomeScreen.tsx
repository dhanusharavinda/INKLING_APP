import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Entry, GameState, Settings } from '../types';
import { palette, serif } from '../theme';
import { emotionMeta } from '../emotions';
import { dayKey, levelFor } from '../gamification';
import EmotionAvatar from '../components/EmotionAvatar';
import { Button, Card, Chip, ProgressBar, SectionTitle } from '../components/ui';

interface Props {
  entries: Entry[];
  game: GameState;
  settings: Settings;
  remainingToday: number;
  dailyLimit: number;
  onOpenEntry: (id: string) => void;
  onCompose: () => void;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayHeading(key: string): string {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

interface DayGroup {
  key: string;
  entries: Entry[];
}

export default function HomeScreen({
  entries,
  game,
  settings,
  remainingToday,
  dailyLimit,
  onOpenEntry,
  onCompose,
}: Props) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt - a.createdAt),
    [entries]
  );
  const latest = sorted[0];
  const level = levelFor(game.xp);
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? 'Still awake' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = settings.name.trim();

  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, Entry[]>();
    for (const e of sorted) {
      const k = dayKey(e.createdAt);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, es]) => ({ key, entries: es }));
  }, [sorted]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>
            {greeting}
            {name ? `, ${name}` : ''} ✦
          </Text>
          <Text style={styles.appName}>Inkling</Text>
        </View>
        <View style={styles.streakPill}>
          <Text style={styles.streakFlame}>🔥</Text>
          <Text style={styles.streakNum}>{game.streak}</Text>
          <Text style={styles.streakLabel}>day{game.streak === 1 ? '' : 's'}</Text>
        </View>
      </View>

      {/* level */}
      <Card style={{ marginTop: 14 }}>
        <View style={styles.levelRow}>
          <Chip label={`Lv ${level.index + 1} · ${level.title}`} />
          <Text style={styles.xpText}>
            {game.xp} xp{level.nextXp ? ` / ${level.nextXp}` : ' · max'}
          </Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <ProgressBar progress={level.progress} color={palette.gold} />
        </View>
      </Card>

      {/* new entry, in-screen (no nav-bar FAB) */}
      <View style={{ marginTop: 14 }}>
        <Button
          label={remainingToday > 0 ? '✚  New entry' : 'Daily limit reached'}
          onPress={onCompose}
          color="#7FD1BE"
          textColor={palette.ink}
          disabled={remainingToday <= 0}
        />
        {remainingToday < dailyLimit && (
          <Text style={styles.dailyNote}>
            {remainingToday > 0
              ? `${remainingToday} of ${dailyLimit} entries left today`
              : `You've written all ${dailyLimit} for today. Come back tomorrow.`}
          </Text>
        )}
      </View>

      {/* latest feeling */}
      {latest ? (
        <Pressable onPress={() => onOpenEntry(latest.id)}>
          <Card tint={emotionMeta(latest.analysis.emotion).soft} style={{ marginTop: 14 }}>
            <View style={styles.latestRow}>
              <EmotionAvatar emotion={latest.analysis.emotion} size={84} animated />
              <View style={{ flex: 1 }}>
                <Text style={styles.latestLabel}>
                  Last time, you felt {emotionMeta(latest.analysis.emotion).label.toLowerCase()}
                </Text>
                <Text style={styles.latestEssence}>“{latest.analysis.essence}”</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ) : (
        <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 28 }}>
          <EmotionAvatar emotion="wonder" size={84} animated />
          <Text style={[styles.latestEssence, { textAlign: 'center', marginTop: 12 }]}>
            “Nothing here yet, and that is a kind of beginning.”
          </Text>
          <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
            <Button label="Write your first inkling" onPress={onCompose} />
          </View>
        </Card>
      )}

      {groups.length > 0 && <SectionTitle>Your journal</SectionTitle>}
      {groups.map((g) => {
        const dominant = g.entries.reduce((a, b) => {
          if (b.analysis.intensity !== a.analysis.intensity)
            return b.analysis.intensity > a.analysis.intensity ? b : a;
          return b.createdAt > a.createdAt ? b : a; // stable tiebreak
        });
        return (
          <View key={g.key} style={{ marginBottom: 18 }}>
            <View style={styles.dayHeader}>
              <View
                style={[styles.dayDot, { backgroundColor: emotionMeta(dominant.analysis.emotion).color }]}
              />
              <Text style={styles.dayTitle}>{dayHeading(g.key)}</Text>
              <Text style={styles.dayCount}>
                {g.entries.length} {g.entries.length === 1 ? 'note' : 'notes'}
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {g.entries.map((e) => {
                const meta = emotionMeta(e.analysis.emotion);
                return (
                  <Pressable key={e.id} onPress={() => onOpenEntry(e.id)}>
                    <Card style={styles.entryCard}>
                      <EmotionAvatar emotion={e.analysis.emotion} size={44} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.entryTopRow}>
                          <Text style={styles.entryTime}>{timeOf(e.createdAt)}</Text>
                          {e.inputType === 'voice' && <Text style={styles.voiceTag}>🎙</Text>}
                          {e.sample && (
                            <Chip label="sample" color={palette.line} textColor={palette.inkSoft} />
                          )}
                          <View style={{ flex: 1 }} />
                          <Chip label={meta.label} color={meta.soft} textColor={meta.deep} />
                        </View>
                        <Text style={styles.entryText} numberOfLines={2}>
                          {e.text}
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: palette.bg },
  container: { padding: 20, paddingTop: 26 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  greeting: { fontSize: 14, color: palette.inkSoft, fontWeight: '600' },
  appName: {
    fontFamily: serif,
    fontSize: 34,
    color: palette.ink,
    fontWeight: '700' as const,
    marginTop: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.goldSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 4,
  },
  streakFlame: { fontSize: 16 },
  streakNum: { fontSize: 18, fontWeight: '800', color: '#B8741A' },
  streakLabel: { fontSize: 12, color: '#B8741A', fontWeight: '600' },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpText: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  dailyNote: {
    fontSize: 11.5,
    fontWeight: '600',
    color: palette.inkFaint,
    textAlign: 'center',
    marginTop: 8,
  },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  latestLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  latestEssence: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 25,
    color: palette.ink,
    marginTop: 4,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
  },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  dayTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  dayCount: { fontSize: 12, fontWeight: '600', color: palette.inkFaint },
  entryCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
  },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTime: { fontSize: 12, color: palette.inkSoft, fontWeight: '700' },
  voiceTag: { fontSize: 11 },
  entryText: { fontSize: 14, color: palette.ink, marginTop: 4, lineHeight: 20 },
});
