import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Settings } from '../types';
import { palette, radius, serif } from '../theme';
import { Card, SectionTitle } from '../components/ui';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onEraseAll: () => void;
  onRemoveSamples: () => void;
  hasSamples: boolean;
}

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    // RN Alert buttons are a no-op on web
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

export default function SettingsScreen({
  settings,
  onChange,
  onEraseAll,
  onRemoveSamples,
  hasSamples,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <SectionTitle>You</SectionTitle>
      <Card>
        <Text style={styles.label}>What should Inkling call you?</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name (optional)"
          placeholderTextColor={palette.inkFaint}
          value={settings.name}
          onChangeText={(name) => onChange({ ...settings, name })}
        />
      </Card>

      <SectionTitle>AI connection</SectionTitle>
      <Card>
        <Text style={styles.label}>OpenAI API key</Text>
        <Text style={styles.help}>
          Powers Whisper voice transcription and the deep emotion analysis. Stored only on this
          device. Without it, Inkling runs in demo mode with a lighter local analysis.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="sk-…"
            placeholderTextColor={palette.inkFaint}
            value={settings.apiKey}
            onChangeText={(apiKey) => onChange({ ...settings, apiKey })}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={() => setShowKey((v) => !v)} hitSlop={8}>
            <Text style={{ fontSize: 18 }}>{showKey ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>
        <View style={[styles.statusPill, settings.apiKey.trim() ? styles.statusOn : styles.statusOff]}>
          <Text style={styles.statusText}>
            {settings.apiKey.trim() ? '● Connected — full AI mode' : '○ Demo mode — local analysis'}
          </Text>
        </View>
      </Card>

      <SectionTitle>Voice notes</SectionTitle>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Auto-tailor with AI (default)</Text>
            <Text style={styles.help}>
              When on, spoken notes are tidied into clean entries while keeping your voice.
            </Text>
          </View>
          <Switch
            value={settings.autoTailor}
            onValueChange={(autoTailor) => onChange({ ...settings, autoTailor })}
            trackColor={{ true: palette.accent, false: palette.line }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card>
        {hasSamples && (
          <Pressable
            onPress={() =>
              confirm('Remove sample entries?', 'The starter examples will be deleted.', onRemoveSamples)
            }
            style={styles.actionRow}
          >
            <Text style={styles.actionText}>Remove sample entries</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() =>
            confirm(
              'Erase everything?',
              'All entries, XP, streaks and settings will be gone. This cannot be undone.',
              onEraseAll
            )
          }
          style={styles.actionRow}
        >
          <Text style={[styles.actionText, { color: palette.danger }]}>Erase all data</Text>
        </Pressable>
      </Card>

      <Text style={styles.footer}>
        Inkling · a journal that remembers how you felt{'\n'}voice → Whisper · analysis → GPT ·
        everything stays on your device
      </Text>
      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: palette.bg },
  container: { padding: 20, paddingTop: 26 },
  title: { fontFamily: serif, fontSize: 30, color: palette.ink, fontWeight: '700' as const },
  label: { fontSize: 14, fontWeight: '700', color: palette.ink },
  help: { fontSize: 12.5, color: palette.inkSoft, lineHeight: 18, marginTop: 4, marginBottom: 10 },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.ink,
    marginTop: 8,
  },
  statusPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusOn: { backgroundColor: '#E4F7ED' },
  statusOff: { backgroundColor: palette.goldSoft },
  statusText: { fontSize: 12, fontWeight: '700', color: palette.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionRow: { paddingVertical: 12 },
  actionText: { fontSize: 14, fontWeight: '700', color: palette.accent },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: palette.inkFaint,
    marginTop: 28,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});
