import { Entry, GameState } from './types';
import { EMOTION_KEYS } from './emotions';

export const XP_PER_ENTRY = 25;
export const XP_VOICE_BONUS = 10;

export const LEVELS = [
  { xp: 0, title: 'Wanderer' },
  { xp: 75, title: 'Noticer' },
  { xp: 200, title: 'Seeker' },
  { xp: 400, title: 'Thinker' },
  { xp: 700, title: 'Stoic-in-Training' },
  { xp: 1100, title: 'Sage' },
  { xp: 1600, title: 'Philosopher' },
];

export interface LevelInfo {
  index: number;
  title: string;
  currentXp: number;
  nextXp: number | null; // null at max level
  progress: number; // 0..1 toward next level
}

export function levelFor(xp: number): LevelInfo {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) index = i;
  }
  const next = LEVELS[index + 1] ?? null;
  const base = LEVELS[index].xp;
  return {
    index,
    title: LEVELS[index].title,
    currentXp: xp,
    nextXp: next ? next.xp : null,
    progress: next ? Math.min(1, (xp - base) / (next.xp - base)) : 1,
  };
}

export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-ink', emoji: '🪶', title: 'First Ink', desc: 'Wrote your very first entry' },
  { id: 'spoken-soul', emoji: '🎙️', title: 'Spoken Soul', desc: 'Journaled with your voice' },
  { id: 'seedling', emoji: '🌱', title: 'Habit Seedling', desc: '3-day streak' },
  { id: 'week-of-wondering', emoji: '🌖', title: 'Week of Wondering', desc: '7-day streak' },
  { id: 'moon-cycle', emoji: '🌕', title: 'Moon Cycle', desc: '30-day streak' },
  { id: 'ten-thoughts', emoji: '📚', title: 'Ten Thoughts', desc: '10 entries written' },
  { id: 'full-spectrum', emoji: '🌈', title: 'Full Spectrum', desc: 'Felt all 8 emotions' },
  { id: 'night-owl', emoji: '🦉', title: 'Night Owl', desc: 'Journaled after midnight' },
];

export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function defaultGame(): GameState {
  return { xp: 0, streak: 0, bestStreak: 0, lastEntryDay: null, badges: [] };
}

export interface GameUpdate {
  game: GameState;
  earnedXp: number;
  newBadges: BadgeDef[];
}

// Apply a freshly saved entry to the game state. `allEntries` includes the new entry.
export function applyEntryToGame(
  game: GameState,
  entry: Entry,
  allEntries: Entry[]
): GameUpdate {
  const today = dayKey(entry.createdAt);
  let streak = game.streak;
  if (game.lastEntryDay === null) {
    streak = 1;
  } else {
    const gap = daysBetween(game.lastEntryDay, today);
    if (gap === 1) streak = game.streak + 1;
    else if (gap > 1) streak = 1;
    // gap === 0 → same day, streak unchanged
  }

  let earnedXp = XP_PER_ENTRY + (entry.inputType === 'voice' ? XP_VOICE_BONUS : 0);

  const real = allEntries.filter((e) => !e.sample);
  const badges = new Set(game.badges);
  const newBadges: BadgeDef[] = [];
  const award = (id: string) => {
    if (!badges.has(id)) {
      badges.add(id);
      const def = badgeById(id);
      if (def) newBadges.push(def);
    }
  };

  if (real.length >= 1) award('first-ink');
  if (entry.inputType === 'voice') award('spoken-soul');
  if (streak >= 3) award('seedling');
  if (streak >= 7) award('week-of-wondering');
  if (streak >= 30) award('moon-cycle');
  if (real.length >= 10) award('ten-thoughts');
  const felt = new Set(real.map((e) => e.analysis.emotion));
  if (EMOTION_KEYS.every((k) => felt.has(k))) award('full-spectrum');
  const hour = new Date(entry.createdAt).getHours();
  if (hour >= 0 && hour < 4) award('night-owl');

  earnedXp += newBadges.length * 15;

  const next: GameState = {
    xp: game.xp + earnedXp,
    streak,
    bestStreak: Math.max(game.bestStreak, streak),
    lastEntryDay: today,
    badges: Array.from(badges),
  };
  return { game: next, earnedXp, newBadges };
}
