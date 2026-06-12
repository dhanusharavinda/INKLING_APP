import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Entry } from '../types';
import { palette, serif } from '../theme';
import { emotionMeta } from '../emotions';
import EmotionAvatar from '../components/EmotionAvatar';
import { Card, Chip, ProgressBar, SectionTitle } from '../components/ui';

interface Props {
  entry: Entry;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export default function EntryDetail({ entry, onClose, onDelete }: Props) {
  const meta = emotionMeta(entry.analysis.emotion);
  const secondary = entry.analysis.secondary ? emotionMeta(entry.analysis.secondary) : null;
  const a = entry.analysis;
  const date = new Date(entry.createdAt).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const time = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={[styles.backdrop]}>
      <View style={[styles.sheet, { backgroundColor: meta.soft }]}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.topRow}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>←</Text>
            </Pressable>
            <Text style={styles.dateText}>
              {date} · {time}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {/* the feeling, front and center */}
          <View style={styles.hero}>
            <EmotionAvatar emotion={a.emotion} size={110} animated />
            <Text style={[styles.heroLabel, { color: meta.deep }]}>
              You felt {meta.label.toLowerCase()}
              {secondary ? `, with a hint of ${secondary.label.toLowerCase()}` : ''}
            </Text>
            <Text style={styles.heroTone}>{a.tone}</Text>
            <View style={{ width: '60%', marginTop: 10 }}>
              <ProgressBar progress={a.intensity / 100} color={meta.color} height={10} />
            </View>
            <Text style={styles.intensityText}>{a.intensity}% intensity</Text>
          </View>

          <SectionTitle style={{ marginTop: 8 }}>The note</SectionTitle>
          <Card>
            <Text style={styles.noteText}>{entry.text}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {entry.inputType === 'voice' && (
                <Chip label="🎙 spoken" color={palette.line} textColor={palette.inkSoft} />
              )}
              {entry.tailored && (
                <Chip label="✨ AI-tailored" color={palette.accentSoft} textColor={palette.accent} />
              )}
              {a.source === 'local' && (
                <Chip label="demo analysis" color={palette.goldSoft} textColor="#B8741A" />
              )}
            </View>
          </Card>

          {entry.rawTranscript && entry.tailored && entry.rawTranscript !== entry.text && (
            <>
              <SectionTitle>Exactly as you spoke it</SectionTitle>
              <Card style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
                <Text style={styles.rawText}>{entry.rawTranscript}</Text>
              </Card>
            </>
          )}

          <SectionTitle>How you were, in this moment</SectionTitle>
          <Card>
            <Text style={styles.fieldLabel}>Mindset</Text>
            <Text style={styles.fieldText}>{a.mindset}</Text>
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Way of thinking</Text>
            <Text style={styles.fieldText}>{a.thinkingStyle}</Text>
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>The essence</Text>
            <Text style={styles.essence}>“{a.essence}”</Text>
          </Card>

          {a.reflection ? (
            <>
              <SectionTitle>A small reflection</SectionTitle>
              <Card tint={palette.accentSoft}>
                <Text style={styles.reflection}>{a.reflection}</Text>
              </Card>
            </>
          ) : null}

          {a.philosopher ? (
            <>
              <SectionTitle>You thought like…</SectionTitle>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={styles.philBubble}>
                    <Text style={{ fontSize: 26 }}>🏛️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.philName}>{a.philosopher.name}</Text>
                    <Text style={styles.philSchool}>{a.philosopher.school}</Text>
                  </View>
                </View>
                <Text style={[styles.fieldText, { marginTop: 12 }]}>{a.philosopher.why}</Text>
              </Card>
            </>
          ) : null}

          <Pressable onPress={() => onDelete(entry.id)} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete this entry</Text>
          </Pressable>
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(45, 36, 51, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '94%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  container: { padding: 20, paddingTop: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { fontSize: 22, color: palette.ink, fontWeight: '700' },
  dateText: { fontSize: 13, fontWeight: '700', color: palette.inkSoft },
  hero: { alignItems: 'center', marginTop: 18, marginBottom: 10 },
  heroLabel: {
    fontFamily: serif,
    fontSize: 22,
    fontWeight: '700' as const,
    marginTop: 12,
    textAlign: 'center',
  },
  heroTone: { fontSize: 14, fontStyle: 'italic', color: palette.inkSoft, marginTop: 4 },
  intensityText: { fontSize: 11, fontWeight: '700', color: palette.inkSoft, marginTop: 6 },
  noteText: { fontSize: 16, lineHeight: 25, color: palette.ink },
  rawText: { fontSize: 14, lineHeight: 21, color: palette.inkSoft, fontStyle: 'italic' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.inkFaint,
  },
  fieldText: { fontSize: 14.5, lineHeight: 22, color: palette.ink, marginTop: 4 },
  essence: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 27,
    color: palette.ink,
    marginTop: 4,
  },
  reflection: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 16,
    lineHeight: 25,
    color: '#4A3F8F',
  },
  philBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  philName: { fontFamily: serif, fontSize: 18, fontWeight: '700' as const, color: palette.ink },
  philSchool: { fontSize: 12, fontWeight: '700', color: palette.inkSoft, marginTop: 2 },
  deleteBtn: { alignItems: 'center', marginTop: 28 },
  deleteText: { color: palette.danger, fontWeight: '700', fontSize: 14 },
});
