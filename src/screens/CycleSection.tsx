import React, { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CycleEntry, PairInfo } from '../types';
import { palette, radius, serif } from '../theme';
import {
  deleteCycle,
  friendlyCloudError,
  reassignCycleSubject,
  saveCycle,
  updateCycle,
} from '../cloud';
import {
  CYCLE_MOODS,
  FLOW_LEVELS,
  MAX_PERIOD_DAYS,
  SYMPTOMS,
  careNudges,
  cycleNow,
  cycleStats,
  dayKeyPlus,
  daysBetween,
  phaseMeta,
  prettyDay,
} from '../cycle';
import { utcDayKey } from '../gameScene';
import { makeId } from '../storage';
import { Button, Card, confirmAsk } from '../components/ui';
import CycleWheel from '../components/CycleWheel';

// The cycle corner: one ring that shows where she is today, what that phase
// usually asks for, and what he can actually do about it. Either partner can
// log or correct an entry, because some days she is in no state to.

interface Props {
  pair: PairInfo;
  userId: string;
  myName: string;
  partnerName: string;
  cycles: CycleEntry[];
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
  pour: (emoji: string) => void;
}

// What she can ask for, when the cycle being tracked is her own.
function askNudges(name: string): { label: string; message: string }[] {
  const him = name.trim() || 'love';
  return [
    { label: '🍫 bring chocolate', message: `${him}, chocolate. that is the whole message 🍫` },
    { label: '🫂 need a hug', message: `${him}, i need one of your hugs. the long kind 🫂` },
    { label: '🍲 handle dinner?', message: `${him}, can you take dinner tonight? i am running on empty 🍲` },
    { label: '🔥 hot bag please', message: `${him}, hot water bag? cramps are winning 🔥` },
  ];
}

export default function CycleSection({
  pair,
  userId,
  myName,
  partnerName,
  cycles,
  onRefresh,
  onError,
  pour,
}: Props) {
  const today = utcDayKey();
  const partnerId = (pair.userA === userId ? pair.userB : pair.userA) ?? '';

  // Whose cycle: settled by the entries themselves once there is one.
  const trackedSubject = cycles.length > 0 ? cycles[0].subject : null;
  const iAmSubject = trackedSubject === userId;
  const subjectName = trackedSubject
    ? trackedSubject === userId
      ? myName.trim() || 'you'
      : partnerName
    : '';

  const mine = useMemo(
    () => (trackedSubject ? cycles.filter((c) => c.subject === trackedSubject) : []),
    [cycles, trackedSubject]
  );
  const stats = useMemo(() => cycleStats(mine), [mine]);
  const now = useMemo(() => cycleNow(mine, stats), [mine, stats]);
  const meta = phaseMeta(now.phase);
  const ongoing = mine.find((c) => !c.endDay && c.startDay <= today) ?? null;

  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState<CycleEntry | null>(null);

  // composer state. The subject starts UNCHOSEN on purpose: guessing whose
  // cycle this is and quietly locking it in was worse than asking.
  const [subjectChoice, setSubjectChoice] = useState<'me' | 'them' | null>(null);
  const [startDay, setStartDay] = useState(today);
  const [flow, setFlow] = useState('medium');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');

  function openLog(entry: CycleEntry | null) {
    setEditing(entry);
    if (entry) {
      setStartDay(entry.startDay);
      setFlow(entry.flow);
      setSymptoms(entry.symptoms);
      setMood(entry.mood);
      setNote(entry.note);
      setSubjectChoice(entry.subject === userId ? 'me' : 'them');
    } else {
      setStartDay(today);
      setFlow('medium');
      setSymptoms([]);
      setMood('');
      setNote('');
      setSubjectChoice(trackedSubject ? (iAmSubject ? 'me' : 'them') : null);
    }
    setLogOpen(true);
  }

  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const shiftStart = (delta: number) => {
    const next = dayKeyPlus(startDay, delta);
    if (next > today) return; // a period cannot start in the future
    if (daysBetween(next, today) > 60) return; // and not a year ago either
    setStartDay(next);
  };

  async function handleSave() {
    if (busy) return;
    const subject = trackedSubject ?? (subjectChoice === 'me' ? userId : partnerId);
    if (!trackedSubject && !subjectChoice) {
      onError('Whose cycle is this? Pick one first ♡');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateCycle(editing.id, { flow, symptoms, mood, note });
      } else {
        await saveCycle(pair.id, {
          id: makeId(),
          subject,
          startDay,
          endDay: null,
          flow,
          symptoms,
          mood,
          note,
        });
        pour('🌹');
      }
      setLogOpen(false);
      setEditing(null);
      await onRefresh();
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseOut(entry: CycleEntry, endDay: string) {
    if (busy) return;
    setBusy(true);
    try {
      // an entry nobody remembered to close should not record a 60-day period
      const capped =
        daysBetween(entry.startDay, endDay) + 1 > MAX_PERIOD_DAYS
          ? dayKeyPlus(entry.startDay, MAX_PERIOD_DAYS - 1)
          : endDay;
      await updateCycle(entry.id, { endDay: capped });
      await onRefresh();
      pour('🤍');
    } catch (e) {
      onError(friendlyCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(entry: CycleEntry) {
    confirmAsk(
      'Remove this entry?',
      `The ${prettyDay(entry.startDay)} entry goes away and the predictions relearn without it.`,
      async () => {
        try {
          await deleteCycle(entry.id);
          await onRefresh();
        } catch (e) {
          onError(friendlyCloudError(e));
        }
      },
      'Remove'
    );
  }

  // Picked the wrong person on the very first log? Move the whole history
  // across instead of making them delete every entry.
  function handleSwitchSubject() {
    const to = iAmSubject ? partnerName : myName.trim() || 'you';
    confirmAsk(
      `Track ${to}'s cycle instead?`,
      'Every entry you have logged moves across. Nothing is lost, the predictions just follow the right person.',
      async () => {
        try {
          await reassignCycleSubject(pair.id, iAmSubject ? partnerId : userId);
          await onRefresh();
        } catch (e) {
          onError(friendlyCloudError(e));
        }
      },
      'Switch'
    );
  }

  function sendNudge(message: string) {
    const enc = encodeURIComponent(message);
    if (Platform.OS === 'web') {
      Linking.openURL(`https://wa.me/?text=${enc}`).catch(() =>
        onError('Could not open WhatsApp from this browser.')
      );
      return;
    }
    Linking.openURL(`whatsapp://send?text=${enc}`).catch(() => {
      Linking.openURL(`https://wa.me/?text=${enc}`).catch(() =>
        onError('Could not open WhatsApp on this device.')
      );
    });
  }

  const nudges = iAmSubject ? askNudges(partnerName) : careNudges(now.phase, subjectName || partnerName);

  // ---------- empty state ----------

  if (!trackedSubject) {
    return (
      <>
        <Card style={{ marginTop: 10, alignItems: 'center', paddingVertical: 26 }}>
          <Text style={{ fontSize: 36 }}>🌸</Text>
          <Text style={styles.introTitle}>her rhythm, tracked by both of you</Text>
          <Text style={styles.introText}>
            Log the day a period starts and this learns the rest: how long her cycle actually
            runs, when the next one is likely, and which phase today belongs to. No 28-day
            assumption, it measures her own pattern and gets sharper every month.
          </Text>
          <Text style={styles.introText}>
            Either of you can log or fix an entry, and whoever is not the one bleeding gets
            phase-aware nudges to send: eat, sleep, hot bag, chocolate.
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
            <Button label="🌹 log the first period" onPress={() => openLog(null)} color="#E8637C" />
          </View>
        </Card>
        {logModal()}
      </>
    );
  }

  // ---------- tracking ----------

  return (
    <>
      <Card tint={meta.soft} style={{ marginTop: 10 }}>
        <CycleWheel stats={stats} now={now} partnerLabel={subjectName} />
        <View style={styles.phaseHead}>
          <Text style={[styles.phaseTitle, { color: meta.color }]}>
            {meta.emoji} {meta.label}
          </Text>
          <Text style={styles.phaseMood}>{meta.mood}</Text>
        </View>

        {now.onPeriod && now.periodEndsOn && (
          <Text style={styles.predictLine}>
            usually done around {prettyDay(now.periodEndsOn)}
          </Text>
        )}
        {!now.onPeriod && now.daysUntilNext !== null && (
          <Text style={styles.predictLine}>
            {now.daysUntilNext < 0
              ? `${Math.abs(now.daysUntilNext)} days late · ${
                  stats.regular ? 'worth a check in' : 'her cycle does wander, so this happens'
                }`
              : `next one ${
                  stats.regular
                    ? `around ${prettyDay(now.nextStart)}`
                    : `somewhere between ${prettyDay(now.windowFrom)} and ${prettyDay(now.windowTo)}`
                }`}
          </Text>
        )}
        <Text style={styles.confidence}>
          {stats.confidence === 'confident'
            ? `learned from ${stats.samples} cycles · typically ${stats.cycleLength} days, ${stats.periodLength} days of bleeding`
            : stats.confidence === 'settling'
            ? `still learning (${stats.samples} cycles in) · guessing ${stats.cycleLength} days for now`
            : 'first cycle logged · predictions sharpen after the next one'}
        </Text>
      </Card>

      {/* what this phase asks for */}
      {(meta.her.length > 0 || meta.him.length > 0) && (
        <Card style={{ marginTop: 10 }}>
          <View style={styles.careCols}>
            <View style={styles.careCol}>
              <Text style={styles.careHead}>{iAmSubject ? 'you might need' : 'she might need'}</Text>
              {meta.her.map((t) => (
                <Text key={t} style={styles.careItem}>
                  · {t}
                </Text>
              ))}
            </View>
            <View style={styles.careCol}>
              <Text style={styles.careHead}>{iAmSubject ? 'they can help by' : 'you can'}</Text>
              {meta.him.map((t) => (
                <Text key={t} style={styles.careItem}>
                  · {t}
                </Text>
              ))}
            </View>
          </View>
        </Card>
      )}

      {/* whatsapp pokes */}
      <Card style={{ marginTop: 10 }}>
        <Text style={styles.sectionLabel}>
          {iAmSubject ? `tell ${partnerName} what you need` : `send ${subjectName} a nudge`}
        </Text>
        <Text style={styles.sectionSub}>opens WhatsApp with it typed out ♡</Text>
        <View style={styles.nudgeRow}>
          {nudges.map((n) => (
            <Pressable key={n.label} style={styles.nudgeBtn} onPress={() => sendNudge(n.message)}>
              <Text style={styles.nudgeText}>{n.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* actions + history */}
      <Card style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.sectionLabel}>the log</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleSwitchSubject} hitSlop={6}>
            <Text style={styles.linkText}>
              tracking {iAmSubject ? 'you' : partnerName} · switch
            </Text>
          </Pressable>
        </View>
        {ongoing ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={styles.ongoingLine}>
              🌹 started {prettyDay(ongoing.startDay)} · day{' '}
              {daysBetween(ongoing.startDay, today) + 1}, still going
            </Text>
            <Button
              label="🤍 it ended today"
              onPress={() => handleCloseOut(ongoing, today)}
              color="#7FD1BE"
              textColor={palette.ink}
              disabled={busy}
            />
            <Pressable onPress={() => openLog(ongoing)} hitSlop={6} style={{ alignItems: 'center' }}>
              <Text style={styles.linkText}>edit today&apos;s details</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            <Button label="🌹 log a new period" onPress={() => openLog(null)} color="#E8637C" disabled={busy} />
          </View>
        )}

        {mine.slice(0, 6).map((c) => {
          const days = c.endDay ? daysBetween(c.startDay, c.endDay) + 1 : null;
          return (
            <Pressable key={c.id} style={styles.histRow} onPress={() => openLog(c)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histDay}>{prettyDay(c.startDay)}</Text>
                <Text style={styles.histMeta}>
                  {days ? `${days} days` : 'ongoing'} · {c.flow}
                  {c.symptoms.length > 0 ? ` · ${c.symptoms.slice(0, 3).join(', ')}` : ''}
                  {c.loggedBy !== c.subject ? ' · logged by them ♡' : ''}
                </Text>
                {!!c.note && <Text style={styles.histNote}>&ldquo;{c.note}&rdquo;</Text>}
              </View>
              <Pressable onPress={() => handleDelete(c)} hitSlop={8}>
                <Text style={styles.removeX}>✕</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </Card>

      {logModal()}
    </>
  );

  // ---------- the entry composer ----------

  function logModal() {
    const canPickSubject = !trackedSubject && !editing;
    return (
      <Modal
        visible={logOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => !busy && setLogOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editing ? 'edit this entry' : 'log a period 🌹'}
              </Text>
              <Text style={styles.modalSub}>
                {editing
                  ? prettyDay(editing.startDay)
                  : 'the day it started, however many days ago that was'}
              </Text>

              {canPickSubject && (
                <>
                  <Text style={styles.fieldLabel}>whose cycle is this?</Text>
                  <View style={styles.pickRow}>
                    <Pressable
                      onPress={() => setSubjectChoice('me')}
                      style={[styles.pickChip, subjectChoice === 'me' && styles.pickChipActive]}
                    >
                      <Text
                        style={[styles.pickText, subjectChoice === 'me' && styles.pickTextActive]}
                      >
                        mine{myName.trim() ? ` (${myName.trim()})` : ''}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSubjectChoice('them')}
                      style={[styles.pickChip, subjectChoice === 'them' && styles.pickChipActive]}
                    >
                      <Text
                        style={[styles.pickText, subjectChoice === 'them' && styles.pickTextActive]}
                      >
                        {partnerName}&apos;s
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.subjectHint}>
                    this sets who the whole tracker follows · you can still switch it later
                  </Text>
                </>
              )}

              {!editing && (
                <>
                  <Text style={styles.fieldLabel}>it started on</Text>
                  <View style={styles.stepperRow}>
                    <Pressable onPress={() => shiftStart(-1)} style={styles.stepBtn}>
                      <Text style={styles.stepBtnText}>‹</Text>
                    </Pressable>
                    <Text style={styles.stepValue}>
                      {startDay === today ? 'today' : prettyDay(startDay)}
                    </Text>
                    <Pressable onPress={() => shiftStart(1)} style={styles.stepBtn}>
                      <Text style={styles.stepBtnText}>›</Text>
                    </Pressable>
                  </View>
                  {startDay !== today && (
                    <Text style={styles.agoLine}>{daysBetween(startDay, today)} days ago</Text>
                  )}
                </>
              )}

              <Text style={styles.fieldLabel}>flow</Text>
              <View style={styles.pickRow}>
                {FLOW_LEVELS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFlow(f.key)}
                    style={[styles.pickChip, flow === f.key && styles.pickChipActive]}
                  >
                    <Text style={[styles.pickText, flow === f.key && styles.pickTextActive]}>
                      {'●'.repeat(f.dots)} {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>how she feels</Text>
              <View style={styles.pickRow}>
                {CYCLE_MOODS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMood(mood === m ? '' : m)}
                    style={[styles.pickChip, mood === m && styles.pickChipActive]}
                  >
                    <Text style={[styles.pickText, mood === m && styles.pickTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>what is showing up</Text>
              <View style={styles.pickRow}>
                {SYMPTOMS.map((s) => {
                  const on = symptoms.includes(s);
                  return (
                    <Pressable
                      key={s}
                      onPress={() => toggleSymptom(s)}
                      style={[styles.pickChip, on && styles.pickChipActive]}
                    >
                      <Text style={[styles.pickText, on && styles.pickTextActive]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>anything else</Text>
              <TextInput
                style={[styles.input, { minHeight: 62, textAlignVertical: 'top' }]}
                placeholder="a note for later ♡"
                placeholderTextColor={palette.inkFaint}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={240}
              />

              <View style={{ marginTop: 14 }}>
                <Button
                  label={busy ? 'saving…' : editing ? 'save the changes' : 'log it 🌹'}
                  onPress={handleSave}
                  color="#E8637C"
                  disabled={busy || (canPickSubject && !subjectChoice)}
                />
              </View>
              <Text style={styles.modalHint}>
                both of you can see and fix this · it is your rhythm together
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  introTitle: {
    fontFamily: serif,
    fontSize: 20,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 10,
    textAlign: 'center',
  },
  introText: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  phaseHead: { alignItems: 'center', marginTop: 10 },
  phaseTitle: { fontFamily: serif, fontSize: 19, fontWeight: '700' },
  phaseMood: { fontSize: 12.5, color: palette.inkSoft, marginTop: 3, textAlign: 'center' },
  predictLine: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 19,
  },
  confidence: {
    fontSize: 11,
    color: palette.inkFaint,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 15,
  },
  careCols: { flexDirection: 'row', gap: 14 },
  careCol: { flex: 1, gap: 3 },
  careHead: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#B0688A',
    marginBottom: 4,
  },
  careItem: { fontSize: 12.5, lineHeight: 18, color: palette.inkSoft },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: palette.ink },
  sectionSub: { fontSize: 11.5, color: palette.inkFaint, marginTop: 2, fontStyle: 'italic' },
  nudgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  nudgeBtn: {
    backgroundColor: '#E7F6E9',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  nudgeText: { color: '#2F9E44', fontWeight: '800', fontSize: 12.5 },
  ongoingLine: { fontSize: 13, fontWeight: '700', color: '#D6336C', textAlign: 'center' },
  linkText: { fontSize: 12, fontWeight: '800', color: palette.inkFaint },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  histDay: { fontSize: 13.5, fontWeight: '800', color: palette.ink },
  histMeta: { fontSize: 11.5, color: palette.inkSoft, marginTop: 2 },
  histNote: { fontSize: 12, fontStyle: 'italic', color: palette.inkFaint, marginTop: 3 },
  removeX: { fontSize: 13, fontWeight: '800', color: palette.inkFaint, paddingLeft: 10 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,36,51,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  modalCard: { backgroundColor: palette.card, borderRadius: 20, padding: 18, maxHeight: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  modalSub: { fontSize: 12.5, color: palette.inkSoft, marginTop: 2 },
  modalHint: {
    fontSize: 11.5,
    color: palette.inkFaint,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: palette.inkSoft,
    marginTop: 14,
    marginBottom: 8,
  },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: palette.bg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickChipActive: { borderColor: '#E8637C', backgroundColor: '#FDE8EC' },
  pickText: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  pickTextActive: { color: '#C2334F' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, fontWeight: '800', color: palette.ink },
  stepValue: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.ink,
    minWidth: 130,
    textAlign: 'center',
  },
  subjectHint: {
    fontSize: 11,
    color: palette.inkFaint,
    marginTop: 6,
    fontStyle: 'italic',
  },
  agoLine: {
    fontSize: 11.5,
    color: palette.inkFaint,
    textAlign: 'center',
    marginTop: 6,
  },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.ink,
  },
});
