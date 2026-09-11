import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { HabitProofMeta, PairEvent, PairGameState, PairHabit } from './types';
import { moodMeta, reactionMeta } from './pairMoods';
import { GAME_GOAL, goalReachedToday, tapsToday, utcDayKey } from './gameScene';
import { remindMinutes } from './habits';

// Local notifications only: they work fully offline and on a sideloaded app.
// (True push with the app killed would need FCM/APNs infrastructure.)

const STREAK_REMINDER_ID = 'streak-reminder';
const REMINDER_HOUR = 20; // a gentle 8pm nudge

let ready = false;

export async function initNotifications(): Promise<void> {
  if (ready || Platform.OS === 'web') return;
  ready = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Inkling',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120, 80, 120],
      lightColor: '#F2789F',
    }).catch(() => {});
  }
  await Notifications.requestPermissionsAsync().catch(() => {});
}

// The next FUTURE occurrence of a local wall-clock time given as minutes
// since midnight. skipToday pushes it to tomorrow even if today's is ahead;
// the while-loop absorbs the "minus 30 minutes wrapped past midnight" edge
// so a scheduled date is never in the past (a past DATE trigger fires
// immediately, which would spam on every sync).
function nextLocalOccurrence(minutes: number, skipToday: boolean, from = new Date()): Date {
  const at = new Date(from);
  at.setHours(0, minutes, 0, 0);
  if (skipToday && at > from) at.setDate(at.getDate() + 1);
  while (at <= from) at.setDate(at.getDate() + 1);
  return at;
}

function scheduleLocal(identifier: string, title: string, body: string, date: Date) {
  return Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: 'default',
    },
  });
}

// One gentle daily reminder while the tap goal is still open. Rescheduled on
// every sync: cancelled once today's goal is reached, revived tomorrow.
export async function ensureStreakReminder(game: PairGameState | null, paired: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
    if (!paired) return;

    const reachedToday = goalReachedToday(game);
    const next = nextLocalOccurrence(REMINDER_HOUR * 60, reachedToday);
    const taps = reachedToday ? GAME_GOAL : tapsToday(game);
    const left = Math.max(1, GAME_GOAL - taps);
    await scheduleLocal(
      STREAK_REMINDER_ID,
      '🐦 Your birds are waiting',
      reachedToday
        ? 'A new day on the wire. Tap together to keep the streak 🔥'
        : `${left} taps to snuggle today and keep the streak 🔥`,
      next
    );
  } catch {
    // notifications denied or unavailable; the app works fine without them
  }
}

// ---------- habit promises: gentle accountability nudges ----------
// Two kinds, both local and rescheduled on every sync (same pattern as the
// streak reminder): a per-habit heads-up 30 minutes before its time, and one
// end-of-day sweep at 9pm if any of MY habits still has no snap or skip.

const HABIT_TAG = 'habit-';
const HABIT_EOD_ID = 'habit-eod';
const EOD_HOUR = 21;

// The browser cannot schedule anything once the tab is gone, so the web path
// is best-effort: in-tab timers that show a browser Notification (when the
// person allowed them) while Inkling stays open, even backgrounded.
const webTimers: ReturnType<typeof setTimeout>[] = [];
function clearWebTimers() {
  while (webTimers.length) {
    const t = webTimers.pop();
    if (t) clearTimeout(t);
  }
}
function webNotify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // notifications unsupported here; the in-app UI still shows what is due
  }
}
function requestWebPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // some browsers only allow asking from a user gesture; fine either way
  }
}

export async function ensureHabitReminders(
  myHabits: PairHabit[],
  loggedTodayIds: ReadonlySet<string>,
  paired: boolean
): Promise<void> {
  // one plan, two delivery mechanisms (native schedule vs in-tab timer)
  const plans: { id: string; title: string; body: string; at: Date }[] = [];
  if (paired && myHabits.length > 0) {
    // 30 minutes before each habit's time (skips a habit already logged
    // today; for a time before 00:30 the heads-up belongs to the previous
    // evening, so the logged-today skip does not apply)
    for (const h of myHabits) {
      const mins = remindMinutes(h.remindAt);
      if (mins === null) continue;
      plans.push({
        id: `${HABIT_TAG}pre-${h.id}`,
        title: `${h.emoji} ${h.title} in 30 minutes`,
        body: 'Camera ready? A real snap keeps your promise (and streak) alive 🔥',
        at: nextLocalOccurrence(mins - 30, loggedTodayIds.has(h.id) && mins >= 30),
      });
    }
    // one 9pm sweep while something is still unlogged
    const open = myHabits.filter((h) => !loggedTodayIds.has(h.id));
    if (open.length > 0) {
      plans.push({
        id: HABIT_EOD_ID,
        title:
          open.length === 1
            ? `🌙 "${open[0].title}" is still waiting for its snap`
            : `🌙 ${open.length} promises are still waiting for snaps`,
        body: 'Prove it with the camera before the day ends, or leave an honest skip note ♡',
        at: nextLocalOccurrence(EOD_HOUR * 60, false),
      });
    }
  }

  if (Platform.OS === 'web') {
    clearWebTimers();
    if (plans.length === 0) return;
    requestWebPermission();
    const now = Date.now();
    for (const p of plans) {
      const delay = p.at.getTime() - now;
      if (delay > 0 && delay <= 86400000) {
        webTimers.push(setTimeout(() => webNotify(p.title, p.body), delay));
      }
    }
    return;
  }

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(HABIT_TAG))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
    await Promise.all(plans.map((p) => scheduleLocal(p.id, p.title, p.body, p.at)));
  } catch {
    // notifications denied or unavailable; the app works fine without them
  }
}

// The one derivation of "my habits" and "logged today", shared by App.tsx's
// cold-start pass and the Us screen's sync effect so the two can never drift.
export async function syncHabitReminders(
  habits: PairHabit[],
  proofs: HabitProofMeta[],
  userId: string,
  paired: boolean
): Promise<void> {
  const today = utcDayKey();
  const mine = habits.filter((h) => h.owner === userId);
  const logged = new Set(
    proofs.filter((p) => p.day === today && p.author === userId).map((p) => p.habitId)
  );
  await ensureHabitReminders(mine, logged, paired);
}

// A partner event arrived while the app is not in the foreground: tell them.
export async function notifyPairEvent(
  e: PairEvent,
  partnerName: string,
  myMood: string | undefined
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const who = partnerName.trim() || 'Your person';
    let title: string;
    let body: string;
    if (e.kind === 'mood') {
      const mood = moodMeta(e.value);
      if (!mood) return;
      title = `${mood.emoji} ${who} ${mood.feels}`;
      body = 'Open Inkling to send something back ♡';
    } else if (e.kind === 'reaction') {
      const r = reactionMeta(e.value);
      const mine = moodMeta(myMood);
      title = `${r?.emoji ?? '💗'} ${who} wants to ${r?.label ?? 'send you something'}`;
      body = mine
        ? `to cherish your "${mine.label}" ${mine.emoji}`
        : 'a little something for you ♡';
    } else if (e.kind === 'link') {
      title = `🎁 ${who} sent you a little something`;
      body = 'Open Inkling and tap it ♡';
    } else {
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // now
    });
  } catch {
    // best-effort only
  }
}
