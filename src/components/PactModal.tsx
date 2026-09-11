import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { PairHabit } from '../types';
import { serif } from '../theme';
import { friendlyCloudError } from '../cloud';

// The Better-for-Love pact: a tiny ceremony. Each person seals the promise by
// holding a thumb on the fingerprint for 5 whole seconds; the ink fills in as
// they hold, and letting go early lets the print fade back out.

const HOLD_MS = 5000;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

// A stylized thumbprint: nested ridge arcs plus a little core.
const PRINT_PATHS = [
  'M 34 86 C 29 62, 34 38, 60 36 C 86 38, 91 62, 86 86',
  'M 40 88 C 36 64, 40 45, 60 43 C 80 45, 84 64, 80 88',
  'M 46 90 C 42 67, 46 52, 60 50 C 74 52, 78 67, 74 90',
  'M 52 90 C 49 71, 51 58, 60 57 C 69 58, 71 71, 68 90',
  'M 60 66 C 64 68, 65 76, 61 82 C 57 79, 56 70, 60 66',
];

const PINK = '#F2789F';
const INK_BG = '#2D2433';
const SOFT = '#C9BBD4';
const FAINT = '#6B5A76';

function stageLine(progress: number, signedNow: boolean): string {
  if (signedNow) return 'sealed ♡';
  if (progress <= 0) return 'press & hold for 5 seconds';
  if (progress < 0.25) return 'pressing ♡';
  if (progress < 0.5) return 'keep holding…';
  if (progress < 0.75) return 'almost there…';
  return 'sealing it…';
}

function FingerprintSeal({
  onComplete,
  busy,
  signed,
}: {
  onComplete: () => void;
  busy: boolean;
  signed: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const holding = useRef(false);
  const startAt = useRef(0);
  const raf = useRef<number | null>(null);
  const lastSet = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  useEffect(
    () => () => {
      holding.current = false;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  // a failed signing attempt hands the thumb another chance
  useEffect(() => {
    if (!busy && !signed && done.current) {
      done.current = false;
      lastSet.current = 0;
      setProgress(0);
    }
  }, [busy, signed]);

  const tick = () => {
    if (!holding.current) return;
    const p = Math.min(1, (Date.now() - startAt.current) / HOLD_MS);
    if (p - lastSet.current >= 0.02 || p >= 1) {
      lastSet.current = p;
      setProgress(p);
    }
    if (p >= 1) {
      holding.current = false;
      if (!done.current) {
        done.current = true;
        try {
          Vibration.vibrate([0, 60, 50, 140]);
        } catch {}
        onComplete();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (busy || signed || done.current) return;
    holding.current = true;
    startAt.current = Date.now();
    lastSet.current = 0;
    setHint(null);
    try {
      Vibration.vibrate(15);
    } catch {}
    tick();
  };

  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const held = (Date.now() - startAt.current) / HOLD_MS;
    lastSet.current = 0;
    setProgress(0);
    if (held > 0.12) {
      setHint('hold it like you hold them: all 5 seconds ♡');
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 2600);
    }
  };

  const p = signed ? 1 : progress;
  const inkOpacity = signed ? 1 : 0.18 + 0.82 * p;

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPressIn={start}
        onPressOut={stop}
        disabled={busy || signed}
        style={styles.sealPress}
      >
        <Svg width={168} height={168} viewBox="0 0 120 120">
          {/* soft glow that warms up while holding */}
          <Circle cx={60} cy={60} r={48} fill={PINK} opacity={0.06 + 0.2 * p} />
          {/* progress ring */}
          <Circle cx={60} cy={60} r={RING_R} stroke={FAINT} strokeWidth={3} fill="none" opacity={0.5} />
          <Circle
            cx={60}
            cy={60}
            r={RING_R}
            stroke={PINK}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C}`}
            strokeDashoffset={RING_C * (1 - p)}
            transform="rotate(-90 60 60)"
          />
          {/* the print itself: faint ridges, inked over as you hold */}
          {PRINT_PATHS.map((d, i) => (
            <Path
              key={`b${i}`}
              d={d}
              stroke={FAINT}
              strokeWidth={3.4}
              strokeLinecap="round"
              fill="none"
              opacity={0.55}
            />
          ))}
          {PRINT_PATHS.map((d, i) => (
            <Path
              key={`p${i}`}
              d={d}
              stroke={PINK}
              strokeWidth={3.4}
              strokeLinecap="round"
              fill="none"
              opacity={inkOpacity}
            />
          ))}
        </Svg>
        {busy && (
          <View style={styles.sealBusy}>
            <ActivityIndicator color={PINK} />
          </View>
        )}
      </Pressable>
      <Text style={styles.sealStage}>{busy ? 'inking it in…' : stageLine(p, signed)}</Text>
      {hint && <Text style={styles.sealHint}>{hint}</Text>}
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  habits: PairHabit[];
  mySignedAt: number | null;
  theirSignedAt: number | null;
  myName: string;
  partnerName: string;
  onSign: () => Promise<void>; // parent signs in the cloud and refreshes
  pour: (emoji: string) => void;
}

export default function PactModal({
  visible,
  onClose,
  habits,
  mySignedAt,
  theirSignedAt,
  myName,
  partnerName,
  onSign,
  pour,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // kept alongside the prop on purpose: signPact can succeed while the
  // follow-up refresh fails silently, and the thumb's word still stands
  const [justSigned, setJustSigned] = useState(false);

  const iSigned = !!mySignedAt || justSigned;
  const bothSigned = iSigned && !!theirSignedAt;

  useEffect(() => {
    if (!visible) setError(null);
  }, [visible]);

  const me = myName.trim() || 'you';

  async function handleComplete() {
    setBusy(true);
    setError(null);
    try {
      await onSign();
      setJustSigned(true);
      pour(theirSignedAt ? '💍' : '🖋️');
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  const fmt = (t: number | null) =>
    t
      ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>the inkling pact</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>{bothSigned ? 'done' : 'later'}</Text>
            </Pressable>
          </View>

          <Text style={styles.bigLine}>Anyone can die for love.</Text>
          <Text style={styles.bigLineAccent}>But will you become better for it?</Text>

          <Text style={styles.body}>
            so we promise each other the little things, out loud:
          </Text>

          <View style={styles.vows}>
            {habits.length === 0 ? (
              <Text style={styles.vowEmpty}>add a promise or two first ♡</Text>
            ) : (
              habits.map((h) => (
                <View key={h.id} style={styles.vowChip}>
                  <Text style={styles.vowText}>
                    {h.emoji} {h.title}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.ruleBox}>
            <Text style={styles.rule}>every snap is real, straight from the camera</Text>
            <Text style={styles.rule}>every skip is owned, with the honest why</Text>
            <Text style={styles.rule}>every streak is something we built together</Text>
          </View>

          <Text style={styles.body}>
            not to be perfect. just to be true. sealed with a thumb, like a promise you can feel.
          </Text>

          {/* signatures */}
          <View style={styles.signRow}>
            <View style={styles.signCol}>
              <Text style={styles.signName}>{me}</Text>
              <Text style={[styles.signState, iSigned && styles.signStateDone]}>
                {iSigned ? `✓ signed${fmt(mySignedAt) ? ` · ${fmt(mySignedAt)}` : ''}` : 'unsigned'}
              </Text>
            </View>
            <Text style={styles.signHeart}>💌</Text>
            <View style={styles.signCol}>
              <Text style={styles.signName}>{partnerName}</Text>
              <Text style={[styles.signState, !!theirSignedAt && styles.signStateDone]}>
                {theirSignedAt ? `✓ signed · ${fmt(theirSignedAt)}` : 'waiting for their thumb ♡'}
              </Text>
            </View>
          </View>

          <FingerprintSeal onComplete={handleComplete} busy={busy} signed={iSigned} />

          {bothSigned ? (
            <Text style={styles.sealed}>
              💍 sealed by two thumbs · you two vs every lazy evening
            </Text>
          ) : iSigned ? (
            <Text style={styles.waiting}>
              your word is in ♡ it becomes a pact when {partnerName} holds their thumb too
            </Text>
          ) : null}

          {error && <Text style={styles.error}>{error}</Text>}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK_BG },
  scroll: { padding: 26, paddingTop: 54 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: PINK,
  },
  close: { fontSize: 14, fontWeight: '800', color: SOFT },
  bigLine: { fontFamily: serif, fontSize: 27, lineHeight: 36, color: '#F6EDF2', fontWeight: '700' },
  bigLineAccent: {
    fontFamily: serif,
    fontSize: 27,
    lineHeight: 36,
    color: PINK,
    fontWeight: '700',
    marginTop: 4,
  },
  body: { fontSize: 13.5, lineHeight: 20, color: SOFT, marginTop: 18 },
  vows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  vowEmpty: { fontSize: 13, color: FAINT, fontStyle: 'italic' },
  vowChip: {
    backgroundColor: 'rgba(242,120,159,0.14)',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  vowText: { fontSize: 13, fontWeight: '700', color: '#F6EDF2' },
  ruleBox: {
    marginTop: 18,
    borderLeftWidth: 2,
    borderLeftColor: PINK,
    paddingLeft: 14,
    gap: 6,
  },
  rule: { fontSize: 13, lineHeight: 19, color: '#E8DCE6', fontStyle: 'italic' },
  signRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
    marginBottom: 18,
  },
  signCol: { flex: 1, alignItems: 'center', gap: 4 },
  signName: { fontFamily: serif, fontSize: 17, fontWeight: '700', color: '#F6EDF2' },
  signState: { fontSize: 11.5, fontWeight: '700', color: FAINT, textAlign: 'center' },
  signStateDone: { color: '#8FD9A8' },
  signHeart: { fontSize: 18 },
  sealPress: { alignItems: 'center', justifyContent: 'center' },
  sealBusy: { position: 'absolute' },
  sealStage: { fontSize: 13.5, fontWeight: '800', color: '#F6EDF2', marginTop: 8 },
  sealHint: { fontSize: 12, color: PINK, fontWeight: '700', marginTop: 6 },
  sealed: {
    fontSize: 13.5,
    fontWeight: '800',
    color: PINK,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 20,
  },
  waiting: {
    fontSize: 12.5,
    color: SOFT,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  error: { marginTop: 14, color: '#F2A0A0', fontSize: 13, textAlign: 'center' },
});
