import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Entry } from '../types';
import { palette, serif } from '../theme';
import { emotionMeta } from '../emotions';
import EmotionAvatar from '../components/EmotionAvatar';
import { Card, Chip, ProgressBar, SectionTitle } from '../components/ui';

interface Props {
  entries: Entry[];
  initialId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function confirmDelete(onYes: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm('Delete this entry? This cannot be undone.'))
      onYes();
    return;
  }
  Alert.alert('Delete this entry?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}

export default function EntryDetail({ entries, initialId, onClose, onDelete }: Props) {
  const { width: winW } = useWindowDimensions();
  const pageW = Math.min(winW, 480);

  // newest first, matching the journal list, so swiping feels consistent
  const list = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);
  const startIndex = Math.max(0, list.findIndex((e) => e.id === initialId));
  const [index, setIndex] = useState(startIndex);
  const listRef = useRef<FlatList<Entry>>(null);

  const current = list[Math.min(index, list.length - 1)] ?? list[0];
  if (!current) return null;
  const meta = emotionMeta(current.analysis.emotion);
  const headerDate = new Date(current.createdAt).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const headerTime = new Date(current.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={[styles.root, { backgroundColor: meta.soft }]}>
      {/* tap anywhere on this header to go back (not just the chevron) */}
      <Pressable onPress={onClose} style={styles.header}>
        <View style={styles.headerSide}>
          <Text style={styles.chevron}>⌄</Text>
          <Text style={styles.backHint}>tap to close</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerDate} numberOfLines={1}>
            {headerDate}
          </Text>
          <Text style={styles.headerTime}>
            {headerTime}
            {list.length > 1 ? `  ·  ${index + 1}/${list.length}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => confirmDelete(() => onDelete(current.id))}
          hitSlop={12}
          style={styles.trashBtn}
        >
          <Text style={styles.trash}>🗑</Text>
        </Pressable>
      </Pressable>

      <FlatList
        ref={listRef}
        data={list}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(e) => e.id}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / pageW))
        }
        renderItem={({ item }) => (
          <View style={{ width: pageW }}>
            <DetailBody entry={item} />
          </View>
        )}
      />

      {list.length > 1 && (
        <View style={styles.swipeHintRow} pointerEvents="none">
          <Text style={styles.swipeHint}>‹ swipe to revisit other days ›</Text>
        </View>
      )}
    </View>
  );
}

function DetailBody({ entry }: { entry: Entry }) {
  const meta = emotionMeta(entry.analysis.emotion);
  const secondary = entry.analysis.secondary ? emotionMeta(entry.analysis.secondary) : null;
  const a = entry.analysis;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerSide: { width: 70 },
  chevron: { fontSize: 26, color: palette.ink, fontWeight: '800', lineHeight: 26 },
  backHint: { fontSize: 10, color: palette.inkSoft, fontWeight: '700', marginTop: -2 },
  headerDate: { fontSize: 14, fontWeight: '800', color: palette.ink },
  headerTime: { fontSize: 12, fontWeight: '600', color: palette.inkSoft, marginTop: 1 },
  trashBtn: { width: 70, alignItems: 'flex-end' },
  trash: { fontSize: 20 },
  swipeHintRow: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  swipeHint: { fontSize: 11, color: palette.inkFaint, fontWeight: '700' },
  container: { paddingHorizontal: 20, paddingTop: 6 },
  hero: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
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
});
