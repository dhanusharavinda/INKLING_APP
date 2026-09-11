import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { HabitProofMeta, PairHabit, PairInfo, PairPact } from '../types';
import { palette, radius, serif } from '../theme';
import {
  addHabit,
  deleteHabit,
  deleteProof,
  fetchProofPhoto,
  friendlyCloudError,
  logHabitProof,
  reactToProof,
  signPact,
} from '../cloud';
import {
  HABIT_EMOJIS,
  HABIT_TIMES,
  formatRemind,
  habitStreak,
  habitWeek,
  pactSides,
  photoFaded,
  proofIndex,
} from '../habits';
import { utcDayKey } from '../gameScene';
import { makeId } from '../storage';
import { Button, Card, confirmAsk } from '../components/ui';
import PactModal from '../components/PactModal';
import ProofCamera from '../components/ProofCamera';

// The accountability corner: promises (habits) either partner can create for
// either of the two, proven daily with a photo taken RIGHT NOW on the camera
// (the gallery is never an option), or skipped honestly with a reason. All of
// it is visible to both, which is the whole point.

const PROOF_REACTIONS = ['❤️', '🔥', '👏', '🥹', '💪'];
const pad2 = (n: number) => String(n).padStart(2, '0');

interface Props {
  pair: PairInfo;
  userId: string;
  myName: string;
  partnerName: string;
  habits: PairHabit[];
  proofMeta: HabitProofMeta[];
  pact: PairPact | null;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
  pour: (emoji: string) => void;
}

export default function HabitsSection({
  pair,
  userId,
  myName,
  partnerName,
  habits,
  proofMeta,
  pact,
  onRefresh,
  onError,
  pour,
}: Props) {
  const today = utcDayKey();
  const iAmA = pair.userA === userId;
  const partnerId = (iAmA ? pair.userB : pair.userA) ?? '';

  const index = useMemo(() => proofIndex(proofMeta), [proofMeta]);
  const myHabits = useMemo(() => habits.filter((h) => h.owner === userId), [habits, userId]);
  const theirHabits = useMemo(() => habits.filter((h) => h.owner !== userId), [habits, userId]);
  const todayProofByHabit = useMemo(() => {
    const m = new Map<string, HabitProofMeta>();
    for (const p of proofMeta) if (p.day === today) m.set(p.habitId, p);
    return m;
  }, [proofMeta, today]);

  const [busy, setBusy] = useState<string | null>(null); // habit/action id in flight

  // composer
  const [composeOpen, setComposeOpen] = useState(false);
  const [forMe, setForMe] = useState(true);
  const [emoji, setEmoji] = useState('💪');
  const [title, setTitle] = useState('');
  const [remindChoice, setRemindChoice] = useState<string>(''); // '' | preset | 'custom'
  const [customH, setCustomH] = useState(18);
  const [customM, setCustomM] = useState(0);

  // skip + snap + viewer
  const [skipFor, setSkipFor] = useState<PairHabit | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [pendingSnap, setPendingSnap] = useState<{ habit: PairHabit; photo: string } | null>(null);
  const [caption, setCaption] = useState('');
  // the browser build shoots through a live webcam view instead of the
  // system camera; this holds the habit being snapped there
  const [webCamFor, setWebCamFor] = useState<PairHabit | null>(null);
  // the viewer stores only the proof's id; habit + proof render from the live
  // props, so a partner's retake or reaction can never leave a stale copy
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null | undefined>(undefined);

  // pact ceremony
  const [pactOpen, setPactOpen] = useState(false);
  const { mine: mySignedAt, theirs: theirSignedAt } = pactSides(pact, iAmA);
  const bothSigned = !!mySignedAt && !!theirSignedAt;

  // the moment the second thumb lands, it rains rings; the baseline is only
  // set once the pact has actually loaded, so an old seal never replays it
  const prevBoth = useRef<boolean | null>(null);
  useEffect(() => {
    if (pact === null) return;
    if (prevBoth.current !== null && bothSigned && !prevBoth.current) pour('💍');
    prevBoth.current = bothSigned;
  }, [pact, bothSigned, pour]);

  const viewerProof = viewerId ? proofMeta.find((p) => p.id === viewerId) ?? null : null;
  const viewerHabit = viewerProof
    ? habits.find((h) => h.id === viewerProof.habitId) ?? null
    : null;

  // if the proof vanishes underneath (partner retake, habit removed), close
  useEffect(() => {
    if (viewerId && !viewerProof) setViewerId(null);
  }, [viewerId, viewerProof]);

  // pull the heavy photo fresh on every open, so a transient network failure
  // is cured by simply reopening the proof
  useEffect(() => {
    setViewerPhoto(undefined);
    if (!viewerId) return;
    const p = proofMeta.find((x) => x.id === viewerId);
    if (!p || p.kind !== 'photo') return;
    let stale = false;
    fetchProofPhoto(viewerId)
      .then((photo) => {
        if (!stale) setViewerPhoto(photo);
      })
      .catch(() => {
        if (!stale) setViewerPhoto(null);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId]);

  // ---------- actions ----------

  function resetComposer() {
    setForMe(true);
    setEmoji('💪');
    setTitle('');
    setRemindChoice('');
    setCustomH(18);
    setCustomM(0);
  }

  async function handleAddHabit() {
    const t = title.trim();
    if (t.length < 2) {
      onError('Give the promise a name (at least 2 letters).');
      return;
    }
    const remindAt =
      remindChoice === 'custom' ? `${pad2(customH)}:${pad2(customM)}` : remindChoice;
    setBusy('compose');
    try {
      await addHabit(pair.id, {
        id: makeId(),
        owner: forMe ? userId : partnerId,
        title: t.slice(0, 40),
        emoji,
        remindAt,
      });
      setComposeOpen(false);
      resetComposer();
      await onRefresh();
      pour('🌱');
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(null);
    }
  }

  function handleRemoveHabit(h: PairHabit) {
    confirmAsk(
      `Remove "${h.title}"?`,
      'The promise and its whole proof history disappear for both of you.',
      async () => {
        try {
          await deleteHabit(h.id);
          await onRefresh();
        } catch (e) {
          onError(friendlyCloudError(e));
        }
      },
      'Remove'
    );
  }

  // Camera ONLY. There is deliberately no gallery path for proofs: a snap is
  // taken in the moment or it does not exist. The capture is resized down
  // before upload, so the row size is bounded by construction and even a
  // 50-megapixel camera can never make a proof too large to send.
  async function handleSnap(h: PairHabit) {
    if (busy) return;
    if (Platform.OS === 'web') {
      // live webcam capture (ProofCamera.web); still camera-only, no gallery
      setWebCamFor(h);
      return;
    }
    setBusy(h.id);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        onError('Inkling needs the camera for real proof snaps. Allow it in your system settings.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const width = asset.width && asset.width > 0 ? Math.min(1280, asset.width) : 1280;
      const small = await manipulateAsync(asset.uri, [{ resize: { width } }], {
        compress: 0.6,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!small.base64) {
        onError('The camera did not hand back a photo. Try again.');
        return;
      }
      setCaption('');
      setPendingSnap({ habit: h, photo: `data:image/jpeg;base64,${small.base64}` });
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendSnap() {
    if (!pendingSnap || busy) return;
    setBusy('send');
    try {
      await logHabitProof(pair.id, {
        id: makeId(),
        habitId: pendingSnap.habit.id,
        day: utcDayKey(),
        kind: 'photo',
        photo: pendingSnap.photo,
        caption: caption.trim().slice(0, 140),
        skipReason: '',
      });
      setPendingSnap(null);
      setCaption('');
      await onRefresh();
      pour('📸');
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendSkip() {
    const reason = skipReason.trim();
    if (!skipFor || busy) return;
    if (reason.length < 3) {
      onError('The honest why is the whole deal ♡ a few words at least.');
      return;
    }
    setBusy('skip');
    try {
      await logHabitProof(pair.id, {
        id: makeId(),
        habitId: skipFor.id,
        day: utcDayKey(),
        kind: 'skip',
        photo: null,
        caption: '',
        skipReason: reason.slice(0, 200),
      });
      setSkipFor(null);
      setSkipReason('');
      await onRefresh();
      pour('🤍');
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(null);
    }
  }

  // No optimistic copy here on purpose: the viewer renders straight from
  // proofMeta, so the reaction appears when the refresh confirms it stuck.
  async function handleReact(proof: HabitProofMeta, emo: string) {
    if (busy === 'react') return;
    const next = proof.reaction === emo ? '' : emo;
    setBusy('react');
    try {
      await reactToProof(proof.id, next);
      await onRefresh();
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(null);
    }
  }

  function handleRetake(proof: HabitProofMeta) {
    confirmAsk(
      proof.kind === 'photo' ? 'Retake today’s proof?' : 'Undo today’s skip?',
      'Today’s log is removed so you can do it again. Only today can ever be redone.',
      async () => {
        try {
          await deleteProof(proof.id);
          setViewerId(null);
          await onRefresh();
        } catch (e) {
          onError(friendlyCloudError(e));
          await onRefresh();
        }
      },
      proof.kind === 'photo' ? 'Retake' : 'Undo'
    );
  }

  // A loving poke that rides on WhatsApp (no phone number needed: the wa.me
  // link opens WhatsApp's own chat picker).
  async function handleNudge(h: PairHabit) {
    const msg = `${h.emoji} a gentle nudge from Inkling: "${h.title}" is still waiting for its real-camera proof today. go be amazing, i’m watching ♡`;
    const enc = encodeURIComponent(msg);
    if (Platform.OS === 'web') {
      // wa.me opens WhatsApp Web's own chat picker
      Linking.openURL(`https://wa.me/?text=${enc}`).catch(() =>
        onError('Could not open WhatsApp from this browser.')
      );
      return;
    }
    try {
      await Linking.openURL(`whatsapp://send?text=${enc}`);
    } catch {
      Linking.openURL(`https://wa.me/?text=${enc}`).catch(() =>
        onError('Could not open WhatsApp on this device.')
      );
    }
  }

  async function handleSign() {
    await signPact();
    await onRefresh();
  }

  // ---------- rendering ----------

  function weekStrip(h: PairHabit) {
    const cells = habitWeek(index.get(h.id), h.createdAt);
    return (
      <View style={styles.weekRow}>
        {cells.map((c) => (
          <View
            key={c.day}
            style={[
              styles.weekDot,
              c.kind === 'photo' && styles.weekDotPhoto,
              c.kind === 'skip' && styles.weekDotSkip,
              c.kind === 'preborn' && styles.weekDotPreborn,
              c.kind === 'open' && styles.weekDotOpen,
              c.day === today && styles.weekDotToday,
            ]}
          />
        ))}
      </View>
    );
  }

  function habitRow(h: PairHabit, mine: boolean) {
    const proof = todayProofByHabit.get(h.id);
    const streak = habitStreak(index.get(h.id));
    const rowBusy = busy === h.id;
    return (
      <View key={h.id} style={styles.habitRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 22 }}>{h.emoji}</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.habitTitle}>{h.title}</Text>
            <Text style={styles.habitMeta}>
              {h.remindAt ? `🔔 ${formatRemind(h.remindAt)} · ` : ''}🔥 {streak}
              {h.createdBy !== h.owner ? ` · asked by ${h.createdBy === userId ? 'you' : partnerName}` : ''}
            </Text>
          </View>
          {weekStrip(h)}
          <Pressable onPress={() => handleRemoveHabit(h)} hitSlop={8} style={{ marginLeft: 8 }}>
            <Text style={styles.removeX}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.habitActions}>
          {proof ? (
            <Pressable style={styles.doneChip} onPress={() => setViewerId(proof.id)}>
              <Text style={styles.doneChipText}>
                {proof.kind === 'photo' ? '📸 snapped ✓ · see it' : '🤍 skipped · see why'}
              </Text>
            </Pressable>
          ) : mine ? (
            <>
              <Pressable
                style={[styles.snapBtn, rowBusy && { opacity: 0.5 }]}
                onPress={() => handleSnap(h)}
                disabled={rowBusy}
              >
                <Text style={styles.snapBtnText}>{rowBusy ? '…' : '📸 snap proof'}</Text>
              </Pressable>
              <Pressable
                style={styles.skipBtn}
                onPress={() => {
                  setSkipReason('');
                  setSkipFor(h);
                }}
              >
                <Text style={styles.skipBtnText}>skip today</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.nudgeBtn} onPress={() => handleNudge(h)}>
              <Text style={styles.nudgeBtnText}>💬 nudge on WhatsApp</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <>
      {/* the pact: read it, then seal it with a 5-second thumb */}
      {habits.length > 0 && (
        <Pressable onPress={() => setPactOpen(true)}>
          <Card tint={bothSigned ? '#EAF7EF' : '#FDE8EF'} style={{ marginTop: 10 }}>
            {bothSigned ? (
              <Text style={styles.pactSealedLine}>
                💍 pact sealed by two thumbs · tap to reread your promise
              </Text>
            ) : (
              <>
                <Text style={styles.pactTitle}>🖋️ the better-for-love pact</Text>
                <Text style={styles.pactText}>
                  Anyone can die for love. But will you become better for it? Read the promise,
                  then hold your thumb on it for 5 whole seconds to sign.
                </Text>
                <Text style={styles.pactCta}>
                  {mySignedAt ? `you signed ♡ waiting for ${partnerName}’s thumb · open` : 'read & sign ♡'}
                </Text>
              </>
            )}
          </Card>
        </Pressable>
      )}

      {habits.length === 0 ? (
        <Card style={{ marginTop: 10, alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ fontSize: 34 }}>💪</Text>
          <Text style={styles.introTitle}>love, but make it productive</Text>
          <Text style={styles.introText}>
            Sleep, gym, water, study: add little promises for yourself or for {partnerName}.
            Each one gets proven daily with a photo taken live on the camera (the gallery is
            locked out, no faking), or skipped honestly with a reason. Snaps grow a streak,
            honest skips pause it, silent misses break it.
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
            <Button
              label="🌱 add the first promise"
              onPress={() => setComposeOpen(true)}
              color="#F2789F"
            />
          </View>
        </Card>
      ) : (
        <>
          <Card style={{ marginTop: 10 }}>
            <Text style={styles.sectionLabel}>your promises</Text>
            {myHabits.length === 0 ? (
              <Text style={styles.emptyLine}>
                none yet · add one for yourself, or wait for {partnerName} to assign you something ♡
              </Text>
            ) : (
              myHabits.map((h) => habitRow(h, true))
            )}
          </Card>

          <Card style={{ marginTop: 10 }}>
            <Text style={styles.sectionLabel}>{partnerName}&apos;s promises</Text>
            {theirHabits.length === 0 ? (
              <Text style={styles.emptyLine}>none yet · you can add one for them 😌</Text>
            ) : (
              theirHabits.map((h) => habitRow(h, false))
            )}
          </Card>

          <View style={{ marginTop: 10 }}>
            <Button label="🌱 add a promise" onPress={() => setComposeOpen(true)} color="#7FD1BE" textColor={palette.ink} />
          </View>

          <View style={styles.legendRow}>
            <View style={[styles.weekDot, styles.weekDotPhoto]} />
            <Text style={styles.legendText}>snapped</Text>
            <View style={[styles.weekDot, styles.weekDotSkip]} />
            <Text style={styles.legendText}>skipped</Text>
            <View style={styles.weekDot} />
            <Text style={styles.legendText}>missed</Text>
          </View>
          <Text style={styles.legend}>
            reminders land 30 min before a promise&apos;s time, plus a 9pm sweep while a snap is
            still missing · snaps are camera-only, so nothing can be faked · proof photos fade
            after 30 days, streaks stay forever
          </Text>
        </>
      )}

      {/* composer */}
      <Modal
        visible={composeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposeOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setComposeOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>a new promise 🌱</Text>
            <Text style={styles.modalSub}>small, real, kind · who is it for?</Text>
            <View style={styles.forRow}>
              <Pressable
                onPress={() => setForMe(true)}
                style={[styles.forChip, forMe && styles.forChipActive]}
              >
                <Text style={[styles.forChipText, forMe && styles.forChipTextActive]}>
                  for me{myName.trim() ? ` (${myName.trim()})` : ''}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setForMe(false)}
                style={[styles.forChip, !forMe && styles.forChipActive]}
              >
                <Text style={[styles.forChipText, !forMe && styles.forChipTextActive]}>
                  for {partnerName}
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="sleep by 11 · gym · 2L of water · morning pages…"
              placeholderTextColor={palette.inkFaint}
              value={title}
              onChangeText={setTitle}
              maxLength={40}
            />
            <View style={styles.emojiRow}>
              {HABIT_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={[styles.emojiPick, emoji === e && styles.emojiPickActive]}
                >
                  <Text style={{ fontSize: 18 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>remind at (heads-up lands 30 min before)</Text>
            <View style={styles.timeRow}>
              <Pressable
                onPress={() => setRemindChoice('')}
                style={[styles.timeChip, remindChoice === '' && styles.timeChipActive]}
              >
                <Text style={styles.timeChipText}>none</Text>
              </Pressable>
              {HABIT_TIMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setRemindChoice(t)}
                  style={[styles.timeChip, remindChoice === t && styles.timeChipActive]}
                >
                  <Text style={styles.timeChipText}>{formatRemind(t)}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setRemindChoice('custom')}
                style={[styles.timeChip, remindChoice === 'custom' && styles.timeChipActive]}
              >
                <Text style={styles.timeChipText}>custom</Text>
              </Pressable>
            </View>
            {remindChoice === 'custom' && (
              <View style={styles.stepperRow}>
                <Pressable onPress={() => setCustomH((h) => (h + 23) % 24)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{pad2(customH)}</Text>
                <Pressable onPress={() => setCustomH((h) => (h + 1) % 24)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
                <Text style={styles.stepColon}>:</Text>
                <Pressable onPress={() => setCustomM((m) => (m + 55) % 60)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{pad2(customM)}</Text>
                <Pressable onPress={() => setCustomM((m) => (m + 5) % 60)} style={styles.stepBtn}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            )}
            <View style={{ marginTop: 14 }}>
              <Button
                label={busy === 'compose' ? '…' : 'make it a promise ♡'}
                onPress={handleAddHabit}
                color="#F2789F"
                disabled={busy === 'compose' || title.trim().length < 2}
              />
            </View>
            <Text style={styles.modalHint}>
              you both see every promise, every snap, every skip · that&apos;s the whole point ♡
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* honest skip */}
      <Modal
        visible={!!skipFor}
        transparent
        animationType="fade"
        onRequestClose={() => setSkipFor(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSkipFor(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              skip {skipFor ? `"${skipFor.title}"` : ''} today? 🤍
            </Text>
            <Text style={styles.modalSub}>
              the streak pauses, the honesty stays · tell {partnerName} why
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              placeholder="period cramps · fever · exam week · brain is soup…"
              placeholderTextColor={palette.inkFaint}
              value={skipReason}
              onChangeText={setSkipReason}
              multiline
              maxLength={200}
              autoFocus
            />
            <View style={{ marginTop: 12 }}>
              <Button
                label={busy === 'skip' ? '…' : 'send the honest skip'}
                onPress={handleSendSkip}
                color="#F5B941"
                textColor={palette.ink}
                disabled={busy === 'skip' || skipReason.trim().length < 3}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* caption + send the fresh snap */}
      <Modal
        visible={!!pendingSnap}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingSnap(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => busy !== 'send' && setPendingSnap(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              proof, live from the camera 📸
            </Text>
            <Text style={styles.modalSub}>
              {pendingSnap ? `${pendingSnap.habit.emoji} ${pendingSnap.habit.title}` : ''}
            </Text>
            {pendingSnap && (
              <Image source={{ uri: pendingSnap.photo }} style={styles.snapPreview} resizeMode="cover" />
            )}
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="caption it (optional) · done & dying 🫠"
              placeholderTextColor={palette.inkFaint}
              value={caption}
              onChangeText={setCaption}
              maxLength={140}
            />
            <View style={{ marginTop: 12 }}>
              <Button
                label={busy === 'send' ? 'sending…' : 'send proof 💪'}
                onPress={handleSendSnap}
                color="#F2789F"
                disabled={busy === 'send'}
              />
            </View>
            <Pressable
              onPress={() => {
                if (busy === 'send' || !pendingSnap) return;
                const h = pendingSnap.habit;
                setPendingSnap(null);
                handleSnap(h);
              }}
              style={{ marginTop: 10, alignItems: 'center' }}
              hitSlop={6}
            >
              <Text style={styles.retakeText}>↻ retake</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* the browser's live camera (native goes through the system camera) */}
      <Modal
        visible={!!webCamFor}
        transparent
        animationType="fade"
        onRequestClose={() => setWebCamFor(null)}
      >
        <View style={[styles.backdrop, styles.center]}>
          {webCamFor && (
            <ProofCamera
              onCapture={(uri) => {
                const h = webCamFor;
                setWebCamFor(null);
                setCaption('');
                setPendingSnap({ habit: h, photo: uri });
              }}
              onCancel={() => setWebCamFor(null)}
            />
          )}
        </View>
      </Modal>

      {/* proof viewer (renders straight from live proofMeta) */}
      <Modal
        visible={!!viewerProof && !!viewerHabit}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerId(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setViewerId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {viewerProof && viewerHabit && (
              <>
                <Text style={styles.modalTitle}>
                  {viewerHabit.emoji} {viewerHabit.title}
                </Text>
                <Text style={styles.modalSub}>
                  {viewerProof.author === userId ? 'you' : partnerName} ·{' '}
                  {new Date(viewerProof.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {viewerProof.kind === 'photo' ? (
                  viewerPhoto === undefined ? (
                    <View style={[styles.snapPreview, styles.center]}>
                      <ActivityIndicator color={palette.accent} />
                    </View>
                  ) : viewerPhoto ? (
                    <Image source={{ uri: viewerPhoto }} style={styles.snapPreview} resizeMode="cover" />
                  ) : (
                    <View style={[styles.snapPreview, styles.center]}>
                      <Text style={[styles.emptyLine, { textAlign: 'center', padding: 16 }]}>
                        {photoFaded(viewerProof.day)
                          ? 'this snap has faded ♡ photos live for 30 days, the streak they built stays forever'
                          : 'the photo could not be loaded · close and reopen to retry'}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.skipBox}>
                    <Text style={styles.skipBoxTitle}>🤍 skipped today</Text>
                    <Text style={styles.skipBoxReason}>&ldquo;{viewerProof.skipReason}&rdquo;</Text>
                  </View>
                )}
                {!!viewerProof.caption && (
                  <Text style={styles.captionLine}>&ldquo;{viewerProof.caption}&rdquo;</Text>
                )}
                {viewerProof.author !== userId ? (
                  <View style={styles.reactRow}>
                    {PROOF_REACTIONS.map((emo) => (
                      <Pressable
                        key={emo}
                        onPress={() => handleReact(viewerProof, emo)}
                        disabled={busy === 'react'}
                        style={[
                          styles.reactBtn,
                          viewerProof.reaction === emo && styles.reactBtnActive,
                          busy === 'react' && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={{ fontSize: 18 }}>{emo}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : viewerProof.reaction ? (
                  <Text style={styles.reactionLine}>
                    {partnerName} felt it {viewerProof.reaction}
                  </Text>
                ) : null}
                {viewerProof.author === userId && viewerProof.day === today && (
                  <Pressable
                    onPress={() => handleRetake(viewerProof)}
                    style={{ marginTop: 12, alignItems: 'center' }}
                    hitSlop={6}
                  >
                    <Text style={styles.retakeText}>
                      {viewerProof.kind === 'photo' ? '↻ retake today’s proof' : '↻ undo today’s skip'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <PactModal
        visible={pactOpen}
        onClose={() => setPactOpen(false)}
        habits={habits}
        mySignedAt={mySignedAt}
        theirSignedAt={theirSignedAt}
        myName={myName}
        partnerName={partnerName}
        onSign={handleSign}
        pour={pour}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  pactTitle: { fontFamily: serif, fontSize: 17, fontWeight: '700', color: palette.ink },
  pactText: { fontSize: 12.5, lineHeight: 18, color: palette.inkSoft, marginTop: 6 },
  pactCta: { fontSize: 13, fontWeight: '800', color: '#D6336C', marginTop: 10 },
  pactSealedLine: { fontSize: 13, fontWeight: '800', color: '#2F9E44' },
  introTitle: {
    fontFamily: serif,
    fontSize: 20,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 10,
  },
  introText: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: palette.ink, marginBottom: 4 },
  emptyLine: { fontSize: 12.5, color: palette.inkFaint, fontStyle: 'italic', marginTop: 6 },
  habitRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  habitTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  habitMeta: { fontSize: 11.5, fontWeight: '700', color: palette.inkSoft, marginTop: 2 },
  removeX: { fontSize: 13, fontWeight: '800', color: palette.inkFaint },
  weekRow: { flexDirection: 'row', gap: 3, marginLeft: 8 },
  weekDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EFE7EA',
  },
  weekDotPhoto: { backgroundColor: '#F2789F' },
  weekDotSkip: { backgroundColor: '#F5B941' },
  weekDotPreborn: { backgroundColor: 'transparent' },
  // today, still unlogged: a day in progress, not a miss
  weekDotOpen: { backgroundColor: '#FFFFFF' },
  weekDotToday: { borderWidth: 1.5, borderColor: '#D6336C' },
  habitActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  snapBtn: {
    backgroundColor: '#F2789F',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  snapBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  skipBtn: {
    backgroundColor: palette.bg,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  skipBtnText: { color: palette.inkSoft, fontWeight: '800', fontSize: 12.5 },
  nudgeBtn: {
    backgroundColor: '#E7F6E9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  nudgeBtnText: { color: '#2F9E44', fontWeight: '800', fontSize: 12.5 },
  doneChip: {
    backgroundColor: '#EAF7EF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneChipText: { color: '#2F9E44', fontWeight: '800', fontSize: 12.5 },
  legend: {
    fontSize: 11,
    color: palette.inkFaint,
    marginTop: 10,
    lineHeight: 16,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  legendText: { fontSize: 11, color: palette.inkFaint },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,36,51,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 70,
    paddingHorizontal: 24,
  },
  modalCard: { backgroundColor: palette.card, borderRadius: 20, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  modalSub: { fontSize: 12.5, color: palette.inkSoft, marginTop: 2, marginBottom: 12 },
  modalHint: {
    fontSize: 11.5,
    color: palette.inkFaint,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  forRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  forChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  forChipActive: { borderColor: '#F2789F', backgroundColor: '#FDE8EF' },
  forChipText: { fontSize: 12.5, fontWeight: '800', color: palette.inkSoft },
  forChipTextActive: { color: '#D6336C' },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.ink,
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  emojiPick: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiPickActive: { borderColor: '#F2789F', backgroundColor: '#FDE8EF' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.inkSoft,
    marginTop: 14,
  },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  timeChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: palette.bg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timeChipActive: { borderColor: '#F2789F', backgroundColor: '#FDE8EF' },
  timeChipText: { fontSize: 12, fontWeight: '800', color: palette.inkSoft },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 17, fontWeight: '800', color: palette.ink },
  stepValue: { fontSize: 18, fontWeight: '800', color: palette.ink, minWidth: 30, textAlign: 'center' },
  stepColon: { fontSize: 18, fontWeight: '800', color: palette.inkSoft },
  snapPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    backgroundColor: palette.bg,
    marginTop: 4,
  },
  captionLine: {
    fontFamily: serif,
    fontSize: 14.5,
    fontStyle: 'italic',
    color: palette.ink,
    marginTop: 10,
    textAlign: 'center',
  },
  skipBox: {
    backgroundColor: '#FCF1DA',
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  skipBoxTitle: { fontSize: 13, fontWeight: '800', color: '#A97B1D' },
  skipBoxReason: {
    fontFamily: serif,
    fontSize: 15,
    fontStyle: 'italic',
    color: palette.ink,
    marginTop: 6,
    lineHeight: 22,
  },
  reactRow: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'center' },
  reactBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reactBtnActive: { borderColor: '#F2789F', backgroundColor: '#FDE8EF' },
  reactionLine: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#B0688A',
    marginTop: 10,
    textAlign: 'center',
  },
  retakeText: { fontSize: 12.5, fontWeight: '800', color: palette.inkFaint },
});
