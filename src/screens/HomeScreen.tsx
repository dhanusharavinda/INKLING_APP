import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Entry, GameState, Settings } from '../types';
import { palette, serif } from '../theme';
import { emotionMeta } from '../emotions';
import { levelFor } from '../gamification';
import EmotionAvatar from '../components/EmotionAvatar';
import { Card, Chip, ProgressBar, SectionTitle } from '../components/ui';

interface Props {
  entries: Entry[];
  game: GameState;
  settings: Settings;
  onOpenEntry: (id: string) => void;
  onCompose: () => void;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` · ${time}`;
}

export default function HomeScreen({ entries, game, settings, onOpenEntry, onCompose }: Props) {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const latest = sorted[0];
  const level = levelFor(game.xp);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still awake' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = settings.name.trim();

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
            “Nothing here yet — and that is a kind of beginning.”
          </Text>
          <Pressable onPress={onCompose} style={styles.emptyCta}>
            <Text style={styles.emptyCtaText}>Write your first inkling</Text>
          </Pressable>
        </Card>
      )}

      <SectionTitle>Your entries</SectionTitle>
      <View style={{ gap: 10 }}>
        {sorted.map((e) => {
          const meta = emotionMeta(e.analysis.emotion);
          return (
            <Pressable key={e.id} onPress={() => onOpenEntry(e.id)}>
              <Card style={styles.entryCard}>
                <EmotionAvatar emotion={e.analysis.emotion} size={46} />
                <View style={{ flex: 1 }}>
                  <View style={styles.entryTopRow}>
                    <Text style={styles.entryDate}>{timeLabel(e.createdAt)}</Text>
                    {e.inputType === 'voice' && <Text style={styles.voiceTag}>🎙</Text>}
                    {e.sample && <Chip label="sample" color={palette.line} textColor={palette.inkSoft} />}
                  </View>
                  <Text style={styles.entryText} numberOfLines={2}>
                    {e.text}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: 'row', gap: 6 }}>
                    <Chip label={meta.label} color={meta.soft} textColor={meta.deep} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
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
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  latestLabel: { fontSize: 12, fontWeight: '700', color: palette.inkSoft, textTransform: 'uppercase', letterSpacing: 0.8 },
  latestEssence: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 25,
    color: palette.ink,
    marginTop: 4,
  },
  emptyCta: {
    marginTop: 16,
    backgroundColor: palette.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700' },
  entryCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
  },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryDate: { fontSize: 12, color: palette.inkSoft, fontWeight: '600' },
  voiceTag: { fontSize: 11 },
  entryText: { fontSize: 14, color: palette.ink, marginTop: 4, lineHeight: 20 },
});
