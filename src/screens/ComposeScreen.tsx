import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import DatePickerField from '../components/DatePickerField';
import { Entry, Settings } from '../types';
import { palette, radius, serif } from '../theme';
import { analyzeLocally, analyzeWithAI, tailorLocally, transcribeAudio } from '../ai';
import { makeId } from '../storage';
import { Card } from '../components/ui';

// Whisper takes long audio fine; cap at 4 minutes so the file stays small and
// the take ends cleanly.
const MAX_RECORD_SECONDS = 240;
const KEEP_AWAKE_TAG = 'inkling-recording';

interface Props {
  settings: Settings;
  remainingToday: number;
  dailyLimit: number;
  onToggleAutoTailor: (v: boolean) => void;
  onSave: (entry: Entry) => void;
  onCancel: () => void;
}

type Mode = 'text' | 'voice';
type Busy = null | 'transcribing' | 'analyzing';

export default function ComposeScreen({
  settings,
  remainingToday,
  dailyLimit,
  onToggleAutoTailor,
  onSave,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [rawTranscript, setRawTranscript] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputWrapRef = useRef<View>(null);
  const editorFocused = useRef(false);

  // null = use the current moment; a Date = a backdated entry (content date only)
  const [when, setWhen] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const hasKey = settings.apiKey.trim().length > 0;

  // Keep the editor above the keyboard by scrolling it into view. Measuring
  // relative to the scroll view's node handle gives the offset to scroll to.
  const scrollEditorIntoView = () => {
    const wrap = inputWrapRef.current;
    const scrollNode = findNodeHandle(scrollRef.current);
    if (!wrap || scrollNode == null) return;
    wrap.measureLayout(
      scrollNode,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }),
      () => {}
    );
  };

  // Re-align the editor whenever the keyboard actually appears (its real timing
  // varies on Android), but only while the note field is the focused input.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (editorFocused.current) scrollEditorIntoView();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, []);

  // Finish cleanly at the 4-minute cap so the take always ends in a saved file.
  useEffect(() => {
    if (recording && seconds >= MAX_RECORD_SECONDS) {
      stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, seconds]);

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  async function startRecording() {
    setError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission was not granted.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      // Keep the screen on so a screen-lock does not background the app and cut
      // the recording short. This is what blocked longer (multi-minute) takes.
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      setRecording(true);
      startTimer();
    } catch (e) {
      setError(`Could not start recording: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function stopRecording() {
    stopTimer();
    setRecording(false);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setError('Recording produced no audio.');
        return;
      }
      if (!hasKey) {
        setError(
          'Voice notes need an OpenAI key for Whisper transcription. Add one in Settings, or type your note below.'
        );
        return;
      }
      setBusy('transcribing');
      const transcript = await transcribeAudio(uri, settings.apiKey.trim());
      if (!transcript) {
        setError('Whisper heard only silence. Try again a little louder.');
        setBusy(null);
        return;
      }
      setRawTranscript(transcript);
      setText(transcript);
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError(`Transcription failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Discard the take in progress: stop the recorder but skip transcription.
  async function cancelRecording() {
    stopTimer();
    setRecording(false);
    setSeconds(0);
    setError(null);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    try {
      await recorder.stop();
    } catch {
      // already stopped or nothing to stop, nothing to do
    }
  }

  async function save() {
    if (remainingToday <= 0) {
      setError(`You have reached the daily limit of ${dailyLimit} entries. Come back tomorrow.`);
      return;
    }
    const body = text.trim();
    if (!body) {
      setError('Write or speak a little something first.');
      return;
    }
    setError(null);
    setBusy('analyzing');
    try {
      const isVoice = mode === 'voice' && !!rawTranscript;
      const wantTailor = isVoice && settings.autoTailor;
      let finalText = body;
      let analysis;

      if (hasKey) {
        const result = await analyzeWithAI(body, wantTailor, settings.apiKey.trim());
        analysis = result.analysis;
        if (wantTailor && result.tailoredText) finalText = result.tailoredText;
      } else {
        if (wantTailor) finalText = tailorLocally(body);
        analysis = analyzeLocally(finalText);
      }

      const entry: Entry = {
        id: makeId(),
        createdAt: when ? when.getTime() : Date.now(),
        text: finalText,
        rawTranscript: isVoice ? rawTranscript : undefined,
        inputType: isVoice ? 'voice' : 'text',
        tailored: wantTailor,
        analysis,
      };
      onSave(entry);
    } catch (e) {
      setBusy(null);
      setError(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const mins = Math.floor(seconds / 60);
  const secs = `${seconds % 60}`.padStart(2, '0');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.cancel}>✕</Text>
          </Pressable>
          <Text style={styles.title}>New inkling</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.prompt}>What's on your mind, and how does it sit with you?</Text>

        {/* mode toggle */}
        <View style={styles.modeRow}>
          {(['text', 'voice'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'text' ? '✏️  Type' : '🎙  Speak'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* entry date: defaults to now, can be backdated (content date only) */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Entry date</Text>
          <Pressable style={styles.datePill} onPress={() => setShowPicker(true)}>
            <Text style={styles.datePillIcon}>📅</Text>
            <Text style={styles.datePillText}>
              {when
                ? when.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Today'}
            </Text>
          </Pressable>
          {when && (
            <Pressable onPress={() => setWhen(null)} hitSlop={8}>
              <Text style={styles.dateReset}>reset</Text>
            </Pressable>
          )}
        </View>
        <DatePickerField
          visible={showPicker}
          value={when}
          onPick={setWhen}
          onClose={() => setShowPicker(false)}
        />

        {mode === 'voice' && (
          <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 22 }}>
            <Pressable
              onPress={recording ? stopRecording : startRecording}
              disabled={busy !== null}
              style={[styles.micBtn, recording && styles.micBtnRecording]}
            >
              <Text style={{ fontSize: 30 }}>{recording ? '⏹' : '🎙'}</Text>
            </Pressable>
            <Text style={styles.micHint}>
              {recording
                ? `Listening… ${mins}:${secs} / 4:00  ·  tap ⏹ to finish`
                : busy === 'transcribing'
                ? 'Whisper is listening back…'
                : 'Tap to speak (up to 4 minutes)'}
            </Text>
            {recording && (
              <Pressable onPress={cancelRecording} hitSlop={8} style={styles.cancelRecBtn}>
                <Text style={styles.cancelRecText}>✕  Cancel</Text>
              </Pressable>
            )}
            <View style={styles.tailorRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tailorTitle}>Auto-tailor with AI</Text>
                <Text style={styles.tailorDesc}>
                  Tidies your spoken words into a clean note. Keeps your voice, drops the “um”s.
                </Text>
              </View>
              <Switch
                value={settings.autoTailor}
                onValueChange={onToggleAutoTailor}
                trackColor={{ true: palette.accent, false: palette.line }}
                thumbColor="#fff"
              />
            </View>
            {!hasKey && (
              <Text style={styles.demoNote}>
                Demo mode: add your OpenAI key in Settings to enable Whisper voice notes.
              </Text>
            )}
          </Card>
        )}

        <View ref={inputWrapRef} collapsable={false}>
          <TextInput
            style={styles.input}
            multiline
            placeholder={
              mode === 'voice'
                ? 'Your transcript will appear here. You can edit it before saving.'
                : 'Dear future me, today I…'
            }
            placeholderTextColor={palette.inkFaint}
            value={text}
            onChangeText={setText}
            editable={busy === null}
            onFocus={() => {
              editorFocused.current = true;
              scrollEditorIntoView();
            }}
            onBlur={() => {
              editorFocused.current = false;
            }}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={busy !== null || remainingToday <= 0}
          style={[styles.saveBtn, (busy !== null || remainingToday <= 0) && { opacity: 0.6 }]}
        >
          {busy === 'analyzing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.saveBtnText}>Capturing how you feel…</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Save & capture this feeling ✨</Text>
          )}
        </Pressable>

        {!hasKey && (
          <Text style={styles.demoFootnote}>
            No API key yet, so Inkling will read the feeling locally (demo). The full AI is deeper.
          </Text>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 26, paddingBottom: 56 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  dateLabel: { fontSize: 13, fontWeight: '700', color: palette.inkSoft },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  datePillIcon: { fontSize: 14 },
  datePillText: { fontSize: 13, fontWeight: '800', color: palette.ink },
  dateReset: { fontSize: 12, fontWeight: '700', color: palette.accent },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { fontSize: 20, color: palette.inkSoft, fontWeight: '600' },
  title: { fontFamily: serif, fontSize: 20, color: palette.ink, fontWeight: '700' as const },
  prompt: {
    marginTop: 18,
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 17,
    color: palette.inkSoft,
    lineHeight: 25,
  },
  modeRow: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: palette.line,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: palette.card },
  modeBtnText: { fontWeight: '700', color: palette.inkSoft, fontSize: 14 },
  modeBtnTextActive: { color: palette.ink },
  micBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnRecording: { backgroundColor: '#FBE3E3' },
  micHint: { marginTop: 10, color: palette.inkSoft, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  cancelRecBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.dangerSoft,
  },
  cancelRecText: { color: palette.danger, fontWeight: '800', fontSize: 13 },
  tailorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    width: '100%',
  },
  tailorTitle: { fontWeight: '700', color: palette.ink, fontSize: 14 },
  tailorDesc: { color: palette.inkSoft, fontSize: 12, marginTop: 2, lineHeight: 17 },
  demoNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#B8741A',
    backgroundColor: palette.goldSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    marginTop: 14,
    minHeight: 160,
    backgroundColor: palette.card,
    borderRadius: radius.card,
    padding: 18,
    fontSize: 16,
    lineHeight: 24,
    color: palette.ink,
    textAlignVertical: 'top',
  },
  error: {
    marginTop: 12,
    color: palette.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  demoFootnote: {
    marginTop: 12,
    fontSize: 12,
    color: palette.inkFaint,
    textAlign: 'center',
    lineHeight: 18,
  },
});
