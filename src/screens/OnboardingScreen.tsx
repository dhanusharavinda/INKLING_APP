import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { palette, serif, radius } from '../theme';
import { Button } from '../components/ui';
import EmotionAvatar from '../components/EmotionAvatar';
import { EmotionKey } from '../types';

interface Props {
  initialName: string;
  initialApiKey: string;
  onComplete: (name: string, apiKey: string) => void;
}

interface Slide {
  emotion: EmotionKey;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emotion: 'wonder',
    title: 'Meet Inkling',
    body: 'A tiny journal that listens for how you feel, not just what you did, so future you can remember exactly how today felt.',
  },
  {
    emotion: 'joy',
    title: 'Write it or speak it',
    body: 'Type a thought or tap the mic and talk. Inkling gently reads the emotion underneath and reflects it back.',
  },
  {
    emotion: 'calm',
    title: 'Watch your frequency rise',
    body: 'Every feeling resonates at its own frequency. Your aura is the blend of them all, and it lifts as you do.',
  },
];

export default function OnboardingScreen({ initialName, initialApiKey, onComplete }: Props) {
  const { width } = useWindowDimensions();
  const pageW = Math.min(width, 480);
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(initialName);
  const [apiKey, setApiKey] = useState(initialApiKey);

  const lastPage = SLIDES.length; // slides + the personalize page
  const goTo = (p: number) => {
    setPage(p);
    scrollRef.current?.scrollTo({ x: p * pageW, animated: true });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, width: pageW, alignSelf: 'center' }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / pageW))
          }
          keyboardShouldPersistTaps="handled"
        >
          {SLIDES.map((s) => (
            <View key={s.title} style={[styles.slide, { width: pageW }]}>
              <View style={styles.bigAvatar}>
                <EmotionAvatar emotion={s.emotion} size={150} animated />
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}

          {/* personalize page */}
          <View style={[styles.slide, { width: pageW }]}>
            <Text style={styles.title}>One last thing</Text>
            <Text style={styles.body}>What should Inkling call you?</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name (optional)"
              placeholderTextColor={palette.inkFaint}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Text style={[styles.body, { marginTop: 18 }]}>
              Paste an OpenAI key to unlock voice notes and deep analysis. You can also add this
              later in Settings.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="sk-… (optional)"
              placeholderTextColor={palette.inkFaint}
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: lastPage + 1 }).map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
          {page < lastPage ? (
            <Button label="Next" onPress={() => goTo(page + 1)} />
          ) : (
            <Button label="Begin journaling" onPress={() => onComplete(name.trim(), apiKey.trim())} />
          )}
          {page < lastPage && (
            <Pressable onPress={() => goTo(lastPage)} style={styles.skip} hitSlop={8}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  slide: { paddingHorizontal: 28, paddingTop: 70, alignItems: 'center' },
  bigAvatar: { marginBottom: 30 },
  title: {
    fontFamily: serif,
    fontSize: 30,
    fontWeight: '700',
    color: palette.ink,
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: palette.inkSoft,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: palette.card,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: palette.ink,
    marginTop: 12,
  },
  footer: { paddingHorizontal: 28, paddingBottom: 28, paddingTop: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.line },
  dotActive: { backgroundColor: palette.accent, width: 22 },
  skip: { alignItems: 'center', marginTop: 12 },
  skipText: { color: palette.inkFaint, fontWeight: '700', fontSize: 14 },
});
