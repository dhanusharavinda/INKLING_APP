// The "together" tap game: two pixel birds on a wire. The pair shares a goal
// of 100 combined taps a day; every 25 taps the birds hop closer (4 pictures),
// and at 100 they snuggle for the rest of the day. Hitting 100 keeps a day
// streak alive; a missed day resets it. Days are UTC to match the server.

import { PairGameState } from './types';

export const GAME_GOAL = 100;
export const GAME_PERSONAL_CAP = 60; // one person can carry at most 60 of the 100
export const GAME_STAGE_SIZE = 25; // picture changes every 25 taps
export const GAME_TAP_COOLDOWN_MS = 250;

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

// Taps that count for today; a stale row from a previous day shows as 0.
export function tapsToday(g: PairGameState | null, now = Date.now()): number {
  if (!g) return 0;
  return g.day === utcDayKey(now) ? Math.min(GAME_GOAL, g.taps) : 0;
}

// The streak is only alive if its last banked day is today or yesterday.
export function effectiveStreak(g: PairGameState | null, now = Date.now()): number {
  if (!g || !g.lastStreakDay) return 0;
  const today = utcDayKey(now);
  const yesterday = utcDayKey(now - 86400000);
  return g.lastStreakDay === today || g.lastStreakDay === yesterday ? g.streak : 0;
}

export function goalReachedToday(g: PairGameState | null, now = Date.now()): boolean {
  return !!g && g.lastStreakDay === utcDayKey(now);
}

// 0..3 -> which bird picture (they hop closer every 25 taps).
export function birdStage(taps: number): number {
  return Math.max(0, Math.min(3, Math.floor(taps / GAME_STAGE_SIZE)));
}

export function stagePhrase(taps: number, reached: boolean): string {
  if (reached || taps >= GAME_GOAL) return 'snuggled up for today ✓';
  const stage = birdStage(taps);
  if (stage === 0) return 'far apart on the wire';
  if (stage === 1) return 'a hop closer';
  if (stage === 2) return 'almost there';
  return 'so close now';
}

// Static requires so Metro bundles the pixel-art frames.
export const BIRD_IMAGES = [
  require('../assets/birds/1.png'),
  require('../assets/birds/2.png'),
  require('../assets/birds/3.png'),
  require('../assets/birds/4.png'),
] as const;

export function birdImageFor(taps: number, reached: boolean): (typeof BIRD_IMAGES)[number] {
  return reached || taps >= GAME_GOAL ? BIRD_IMAGES[3] : BIRD_IMAGES[birdStage(taps)];
}

// My share of today's taps (respecting whether I am userA or userB).
export function myTapsToday(g: PairGameState | null, iAmUserA: boolean, now = Date.now()): number {
  if (!g || g.day !== utcDayKey(now)) return 0;
  return Math.min(GAME_PERSONAL_CAP, iAmUserA ? g.tapsA : g.tapsB);
}

// Apply n of MY taps locally, mirroring the server's day-rollover, personal
// 60-cap and streak rules, so taps feel instant and sync in the background.
export function optimisticTaps(
  g: PairGameState | null,
  n: number,
  iAmUserA: boolean,
  now = Date.now()
): PairGameState {
  const today = utcDayKey(now);
  const yesterday = utcDayKey(now - 86400000);
  const fresh = !g || g.day !== today;
  let tapsA = fresh ? 0 : g.tapsA;
  let tapsB = fresh ? 0 : g.tapsB;
  let streak = g?.streak ?? 0;
  let lastStreakDay = g?.lastStreakDay ?? '';
  if (g && fresh && lastStreakDay !== today && lastStreakDay !== yesterday) {
    streak = 0; // (the server may still save this with a weekly freeze)
  }
  if (iAmUserA) tapsA = Math.min(GAME_PERSONAL_CAP, tapsA + n);
  else tapsB = Math.min(GAME_PERSONAL_CAP, tapsB + n);
  const taps = Math.min(GAME_GOAL, tapsA + tapsB);
  if (taps >= GAME_GOAL && lastStreakDay !== today) {
    streak = lastStreakDay === yesterday ? streak + 1 : 1;
    lastStreakDay = today;
  }
  return {
    taps,
    tapsA,
    tapsB,
    day: today,
    streak,
    lastStreakDay,
    lastFreezeDay: g?.lastFreezeDay ?? '',
    updatedAt: now,
  };
}
