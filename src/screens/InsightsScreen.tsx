import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Entry, GameState } from '../types';
import { palette, serif } from '../theme';
import { emotionMeta } from '../emotions';
import { BADGES, levelFor } from '../gamification';
import EmotionAvatar from '../components/EmotionAvatar';
import { Card, Chip, ProgressBar, SectionTitle } from '../components/ui';
import { EmotionDistribution, MoodMonthGrid } from '../components/Charts';
import KnowledgeGraph from '../components/KnowledgeGraph';

interface Props {
  entries: Entry[];
  game: GameState;
  apiKey: string;
  onOpenEntry: (id: string) => void;
}

export default function InsightsScreen({ entries, game, apiKey, onOpenEntry }: Props) {
  const [badgesOpen, setBadgesOpen] = useState(false);
  const level = levelFor(game.xp);

  const { earliest, latest } = useMemo(() => {
    const s = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    return { earliest: s[0] ?? null, latest: s[s.length - 1] ?? null };
  }, [entries]);

  const avgIntensity =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.analysis.intensity, 0) / entries.length)
      : 0;

  // most frequent philosopher (null when none matched yet)
  const topPhil = useMemo(() => {
    const counts = new Map<string, { school: string; count: number }>();
    entries.forEach((e) => {
      const p = e.analysis.philosopher;
      if (!p) return;
      const cur = counts.get(p.name) ?? { school: p.school, count: 0 };
      counts.set(p.name, { school: p.school, count: cur.count + 1 });
    });
    const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
    return ranked.length > 0 ? ranked[0] : null;
  }, [entries]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.subtitle}>How your inner weather has been moving.</Text>

      <SectionTitle>Your mind, mapped</SectionTitle>
      <Card style={{ padding: 12 }}>
        <KnowledgeGraph entries={entries} apiKey={apiKey} onOpenEntry={onOpenEntry} />
      </Card>

      <SectionTitle>This month</SectionTitle>
      <Card>
        <MoodMonthGrid entries={entries} />
      </Card>

      <SectionTitle>Emotion mix</SectionTitle>
      <Card>
        <EmotionDistribution entries={entries} />
        {entries.length > 0 && (
          <View style={styles.avgRow}>
            <Text style={styles.avgLabel}>Average intensity</Text>
            <View style={{ flex: 1 }}>
              <ProgressBar progress={avgIntensity / 100} color={palette.accent} />
            </View>
            <Text style={styles.avgValue}>{avgIntensity}%</Text>
          </View>
        )}
      </Card>

      {earliest && latest && earliest.id !== latest.id && (
        <>
          <SectionTitle>Then → Now</SectionTitle>
          <Card>
            <Text style={styles.thenNowHint}>
              Your perspective is a moving thing. Here is the proof.
            </Text>
            <View style={styles.thenNowBlock}>
              <View style={styles.thenNowHead}>
                <EmotionAvatar emotion={earliest.analysis.emotion} size={34} />
                <Text style={styles.thenNowDate}>
                  {new Date(earliest.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <Text style={styles.thenNowText}>{earliest.analysis.mindset}</Text>
            </View>
            <Text style={styles.arrow}>↓</Text>
            <View style={[styles.thenNowBlock, { backgroundColor: palette.accentSoft }]}>
              <View style={styles.thenNowHead}>
                <EmotionAvatar emotion={latest.analysis.emotion} size={34} />
                <Text style={styles.thenNowDate}>
                  {new Date(latest.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <Text style={styles.thenNowText}>{latest.analysis.mindset}</Text>
            </View>
          </Card>
        </>
      )}

      {topPhil && (
        <>
          <SectionTitle>Your inner philosopher</SectionTitle>
          <Card tint={palette.goldSoft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 38 }}>🏛️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.philName}>{topPhil[0]}</Text>
                <Text style={styles.philSchool}>
                  {topPhil[1].school} · resembled in {topPhil[1].count}{' '}
                  {topPhil[1].count === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            </View>
            <Text style={styles.philNote}>
              Lately, your way of thinking keeps rhyming with {topPhil[0]}. You are in good company.
            </Text>
          </Card>
        </>
      )}

      <SectionTitle>Your journey</SectionTitle>
      <Card>
        <View style={styles.journeyRow}>
          <View style={styles.journeyStat}>
            <Text style={styles.journeyNum}>🔥 {game.streak}</Text>
            <Text style={styles.journeyLabel}>streak</Text>
          </View>
          <View style={styles.journeyStat}>
            <Text style={styles.journeyNum}>🏆 {game.bestStreak}</Text>
            <Text style={styles.journeyLabel}>best</Text>
          </View>
          <View style={styles.journeyStat}>
            <Text style={styles.journeyNum}>✨ {game.xp}</Text>
            <Text style={styles.journeyLabel}>xp</Text>
          </View>
          <View style={styles.journeyStat}>
            <Text style={styles.journeyNum}>📖 {entries.length}</Text>
            <Text style={styles.journeyLabel}>entries</Text>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Chip label={`Lv ${level.index + 1} · ${level.title}`} />
            {level.nextXp && (
              <Text style={styles.toNext}>{level.nextXp - game.xp} xp to next</Text>
            )}
          </View>
          <ProgressBar progress={level.progress} color={palette.gold} />
        </View>
      </Card>

      <SectionTitle>
        Badges · {game.badges.length}/{BADGES.length}
      </SectionTitle>
      <Card>
        {game.badges.length === 0 ? (
          <Text style={styles.badgeEmpty}>
            No badges yet. Your first entry earns First Ink 🪶
          </Text>
        ) : (
          <View style={styles.medalRow}>
            {(badgesOpen ? BADGES : BADGES.filter((b) => game.badges.includes(b.id))).map((b) => {
              const earned = game.badges.includes(b.id);
              return (
                <View key={b.id} style={styles.medalWrap}>
                  <View style={[styles.medal, !earned && styles.medalLocked]}>
                    <Text style={{ fontSize: 22, opacity: earned ? 1 : 0.3 }}>{b.emoji}</Text>
                  </View>
                  {badgesOpen && (
                    <Text
                      style={[styles.medalLabel, !earned && { color: palette.inkFaint }]}
                      numberOfLines={1}
                    >
                      {b.title}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
        {(badgesOpen || game.badges.length < BADGES.length) && (
          <Pressable onPress={() => setBadgesOpen((v) => !v)} style={styles.seeAll} hitSlop={6}>
            <Text style={styles.seeAllText}>
              {badgesOpen ? 'Show earned only' : `See all ${BADGES.length} badges`}
            </Text>
          </Pressable>
        )}
      </Card>
      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: palette.bg },
  container: { padding: 20, paddingTop: 26 },
  title: { fontFamily: serif, fontSize: 30, color: palette.ink, fontWeight: '700' as const },
  subtitle: { fontSize: 14, color: palette.inkSoft, marginTop: 4, fontStyle: 'italic' },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  avgLabel: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  avgValue: { fontSize: 13, fontWeight: '800', color: palette.ink },
  thenNowHint: { fontSize: 13, fontStyle: 'italic', color: palette.inkSoft, marginBottom: 12 },
  thenNowBlock: {
    backgroundColor: palette.bg,
    borderRadius: 16,
    padding: 14,
  },
  thenNowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  thenNowDate: { fontSize: 12, fontWeight: '800', color: palette.inkSoft },
  thenNowText: { fontSize: 14, lineHeight: 21, color: palette.ink },
  arrow: { textAlign: 'center', fontSize: 18, color: palette.inkFaint, marginVertical: 6 },
  philName: { fontFamily: serif, fontSize: 20, fontWeight: '700' as const, color: palette.ink },
  philSchool: { fontSize: 12, fontWeight: '700', color: '#B8741A', marginTop: 2 },
  philNote: { fontSize: 13.5, lineHeight: 20, color: palette.ink, marginTop: 12, fontStyle: 'italic' },
  journeyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  journeyStat: { alignItems: 'center', flex: 1 },
  journeyNum: { fontSize: 16, fontWeight: '800', color: palette.ink },
  journeyLabel: { fontSize: 11, color: palette.inkSoft, fontWeight: '600', marginTop: 2 },
  toNext: { fontSize: 12, color: palette.inkSoft, fontWeight: '700' },
  badgeEmpty: { fontSize: 13, color: palette.inkSoft, lineHeight: 19 },
  medalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  medalWrap: { alignItems: 'center', width: 56 },
  medal: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalLocked: { backgroundColor: palette.line },
  medalLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 4,
  },
  seeAll: { marginTop: 16, alignItems: 'center' },
  seeAllText: { color: palette.accent, fontWeight: '800', fontSize: 13 },
});
