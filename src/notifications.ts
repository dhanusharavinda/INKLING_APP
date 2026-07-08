import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { PairEvent, PairGameState } from './types';
import { moodMeta, reactionMeta } from './pairMoods';
import { GAME_GOAL, goalReachedToday, tapsToday } from './gameScene';

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

// One gentle daily reminder while the tap goal is still open. Rescheduled on
// every sync: cancelled once today's goal is reached, revived tomorrow.
export async function ensureStreakReminder(game: PairGameState | null, paired: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
    if (!paired) return;

    const now = new Date();
    const next = new Date(now);
    next.setHours(REMINDER_HOUR, 0, 0, 0);
    const reachedToday = goalReachedToday(game);
    if (now >= next || reachedToday) next.setDate(next.getDate() + 1);

    const taps = reachedToday ? GAME_GOAL : tapsToday(game);
    const left = Math.max(1, GAME_GOAL - taps);
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: '🐦 Your birds are waiting',
        body: reachedToday
          ? 'A new day on the wire. Tap together to keep the streak 🔥'
          : `${left} taps to snuggle today and keep the streak 🔥`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: next,
        channelId: 'default',
      },
    });
  } catch {
    // notifications denied or unavailable; the app works fine without them
  }
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
