// Accountability helpers: streak math and day strips for habit promises.
// The rules, in one breath: a real camera snap grows the streak, an honest
// skip (with a reason) pauses it, and a silent miss breaks it. Days are UTC
// to match the server's insert rule and the rest of the pair features.

import { HabitProofMeta } from './types';
import { utcDayKey } from './gameScene';

export type ProofKind = 'photo' | 'skip';

export const HABIT_EMOJIS = [
  '💪', '🏃', '🥗', '💧', '😴', '📚', '🧘', '🚶', '🏋️', '📵', '🧹', '🌱',
];

// Quick preset reminder times for the composer.
export const HABIT_TIMES = ['06:30', '08:00', '12:30', '18:00', '21:00', '22:30'];

export function prevDayKey(day: string): string {
  return utcDayKey(Date.parse(`${day}T12:00:00Z`) - 86400000);
}

// habitId -> day -> kind, for O(1) lookups everywhere below.
export function proofIndex(meta: HabitProofMeta[]): Map<string, Map<string, ProofKind>> {
  const map = new Map<string, Map<string, ProofKind>>();
  for (const p of meta) {
    let days = map.get(p.habitId);
    if (!days) {
      days = new Map();
      map.set(p.habitId, days);
    }
    days.set(p.day, p.kind);
  }
  return map;
}

// Photo days counted through a contiguous run of photo/skip days ending today
// (or yesterday while today is still open, so a pending day never reads as a
// broken streak).
export function habitStreak(days: Map<string, ProofKind> | undefined, now = Date.now()): number {
  if (!days || days.size === 0) return 0;
  let day = utcDayKey(now);
  if (!days.has(day)) day = prevDayKey(day);
  let streak = 0;
  for (let i = 0; i < 500; i++) {
    const k = days.get(day);
    if (k === 'photo') streak += 1;
    else if (k !== 'skip') break;
    day = prevDayKey(day);
  }
  return streak;
}

export interface HabitDayCell {
  day: string;
  // 'open' = today, still unlogged (a day in progress is never a miss);
  // 'preborn' = before the habit existed
  kind: ProofKind | 'miss' | 'open' | 'preborn';
}

// The last n days (oldest first, ending today) for the little dot strip.
export function habitWeek(
  days: Map<string, ProofKind> | undefined,
  habitCreatedAt: number,
  n = 7,
  now = Date.now()
): HabitDayCell[] {
  const born = utcDayKey(habitCreatedAt);
  const today = utcDayKey(now);
  const cells: HabitDayCell[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = utcDayKey(now - i * 86400000);
    const k = days?.get(day);
    cells.push({
      day,
      kind: k ?? (day === today ? 'open' : day < born ? 'preborn' : 'miss'),
    });
  }
  return cells;
}

// Proof PHOTOS live for 30 days (the database strips older payloads, see
// trim_old_proof_photos in schema.sql); the metadata and streaks live on.
export const PHOTO_KEEP_DAYS = 30;

export function photoFaded(day: string, now = Date.now()): boolean {
  return day < utcDayKey(now - PHOTO_KEEP_DAYS * 86400000);
}

// Which pact timestamp is mine and which is theirs, mapped once for everyone.
export function pactSides(
  pact: { signedA: number | null; signedB: number | null } | null,
  iAmA: boolean
): { mine: number | null; theirs: number | null } {
  if (!pact) return { mine: null, theirs: null };
  return iAmA
    ? { mine: pact.signedA, theirs: pact.signedB }
    : { mine: pact.signedB, theirs: pact.signedA };
}

// 'HH:MM' -> minutes since midnight, or null when unset/garbled.
export function remindMinutes(remindAt: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(remindAt);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function formatRemind(remindAt: string): string {
  const mins = remindMinutes(remindAt);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60);
  const mm = String(mins % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? 'am' : 'pm'}`;
}
