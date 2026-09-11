import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PairHabit } from '../types';
import { serif } from '../theme';
import { friendlyCloudError } from '../cloud';
import FingerprintSeal from './FingerprintSeal';

// The Better-for-Love pact: a tiny ceremony. Each person seals the promise by
// holding a thumb on the fingerprint for 5 whole seconds (see FingerprintSeal).

const PINK = '#F2789F';
const INK_BG = '#2D2433';
const SOFT = '#C9BBD4';
const FAINT = '#6B5A76';

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

          <FingerprintSeal onComplete={handleComplete} busy={busy} done={iSigned} />

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
