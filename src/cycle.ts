// The cycle tracker's brain. Everything here is learned from HER logged
// history, never assumed: cycles differ person to person (and month to
// month), so the app measures instead of guessing 28 days at everyone.
//
// Two deliberate choices worth knowing:
//   * the MEDIAN of recent cycles is the typical length, not the mean. One
//     stressful 45-day month should not drag every future prediction.
//   * ovulation is counted BACKWARD from the next period, not forward from
//     the last one. The luteal phase (ovulation to period) is the stable
//     ~14-day half; the follicular half is what stretches. Counting forward
//     is the classic mistake that puts the fertile window in the wrong place
//     for anyone whose cycle is not 28 days.

import { CycleEntry } from './types';
import { utcDayKey } from './gameScene';

const DAY = 86400000;

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
export const LUTEAL_DAYS = 14; // ovulation to period, stable across people
export const PMS_DAYS = 5; // the tender stretch before the next one starts
export const MAX_PERIOD_DAYS = 14; // nobody bleeds longer than this in the UI

// Cycles outside this range are almost certainly a mislog (or a missed
// entry), so they never get to teach the model anything.
const MIN_PLAUSIBLE = 15;
const MAX_PLAUSIBLE = 60;
const LEARN_FROM = 6; // how many recent cycles shape the typical length

export function dayKeyPlus(day: string, n: number): string {
  return utcDayKey(Date.parse(`${day}T12:00:00Z`) + n * DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY
  );
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Her entries, oldest first. Entries are keyed by start day, so this is the
// timeline of periods we know about.
export function sortedCycles(entries: CycleEntry[]): CycleEntry[] {
  return [...entries].sort((a, b) => a.startDay.localeCompare(b.startDay));
}

export type Confidence = 'none' | 'learning' | 'settling' | 'confident';

export interface CycleStats {
  cycleLength: number; // typical days from one period to the next
  periodLength: number; // typical days of bleeding
  spread: number; // how much recent cycles vary (max minus min)
  samples: number; // how many complete cycles we learned from
  confidence: Confidence;
  regular: boolean; // a spread of a week or more reads as irregular
  learned: boolean; // false while we are still using the defaults
}

export function cycleStats(entries: CycleEntry[]): CycleStats {
  const cycles = sortedCycles(entries);
  const gaps: number[] = [];
  for (let i = 1; i < cycles.length; i++) {
    const gap = daysBetween(cycles[i - 1].startDay, cycles[i].startDay);
    if (gap >= MIN_PLAUSIBLE && gap <= MAX_PLAUSIBLE) gaps.push(gap);
  }
  const recent = gaps.slice(-LEARN_FROM);

  const lengths = cycles
    .filter((c) => c.endDay)
    .map((c) => daysBetween(c.startDay, c.endDay as string) + 1)
    .filter((n) => n >= 1 && n <= 14)
    .slice(-LEARN_FROM);

  const samples = recent.length;
  const spread = samples >= 2 ? Math.max(...recent) - Math.min(...recent) : 0;
  const confidence: Confidence =
    samples === 0 ? (cycles.length > 0 ? 'learning' : 'none')
      : samples <= 1 ? 'learning'
      : samples <= 3 ? 'settling'
      : 'confident';

  return {
    cycleLength: samples > 0 ? median(recent) : DEFAULT_CYCLE,
    periodLength: lengths.length > 0 ? median(lengths) : DEFAULT_PERIOD,
    spread,
    samples,
    confidence,
    regular: samples < 2 || spread <= 7,
    learned: samples > 0,
  };
}

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'pms' | 'unknown';

export interface CycleNow {
  phase: Phase;
  dayOfCycle: number | null; // 1-based day within the current cycle
  onPeriod: boolean;
  lastStart: string | null;
  nextStart: string | null; // the single best guess
  windowFrom: string | null; // and the honest window around it
  windowTo: string | null;
  daysUntilNext: number | null;
  ovulationDay: string | null;
  periodEndsOn: string | null; // while bleeding: the expected last day
}

// Is a given day inside a logged period? Uses the recorded end when there is
// one, otherwise her typical period length from that start.
export function periodDayFor(
  entries: CycleEntry[],
  day: string,
  periodLength: number
): CycleEntry | null {
  for (const c of entries) {
    // A forgotten-to-close entry could otherwise paint months of calendar
    // red, so a period is never drawn longer than MAX_PERIOD_DAYS.
    const span = c.endDay
      ? Math.min(MAX_PERIOD_DAYS, daysBetween(c.startDay, c.endDay) + 1)
      : Math.max(1, periodLength);
    const end = dayKeyPlus(c.startDay, span - 1);
    if (day >= c.startDay && day <= end) return c;
  }
  return null;
}

export function cycleNow(
  entries: CycleEntry[],
  stats: CycleStats,
  now = Date.now()
): CycleNow {
  const today = utcDayKey(now);
  const cycles = sortedCycles(entries);
  const last = cycles.length > 0 ? cycles[cycles.length - 1] : null;

  const empty: CycleNow = {
    phase: 'unknown',
    dayOfCycle: null,
    onPeriod: false,
    lastStart: null,
    nextStart: null,
    windowFrom: null,
    windowTo: null,
    daysUntilNext: null,
    ovulationDay: null,
    periodEndsOn: null,
  };
  if (!last) return empty;

  // A start logged in the future is a typo, not a prediction.
  if (last.startDay > today) return { ...empty, lastStart: last.startDay };

  const dayOfCycle = daysBetween(last.startDay, today) + 1;
  const current = periodDayFor(entries, today, stats.periodLength);
  const onPeriod = !!current && !current.endDay ? true : !!current;

  const nextStart = dayKeyPlus(last.startDay, stats.cycleLength);
  const daysUntilNext = daysBetween(today, nextStart);
  // An irregular history earns a wider window; a steady one earns a tight
  // two-day courtesy margin. Saying "around the 14th, give or take" beats
  // pretending to know the hour.
  const margin = Math.max(2, Math.min(7, Math.round(stats.spread / 2)));
  const ovulation = dayKeyPlus(nextStart, -LUTEAL_DAYS);

  let phase: Phase;
  if (onPeriod) {
    phase = 'menstrual';
  } else if (daysUntilNext <= PMS_DAYS && daysUntilNext >= 0) {
    phase = 'pms';
  } else {
    const toOvulation = daysBetween(today, ovulation);
    if (Math.abs(toOvulation) <= 1) phase = 'ovulation';
    else if (toOvulation > 1) phase = 'follicular';
    else phase = 'luteal';
  }

  return {
    phase,
    dayOfCycle: dayOfCycle > 0 ? dayOfCycle : null,
    onPeriod,
    lastStart: last.startDay,
    nextStart,
    windowFrom: dayKeyPlus(nextStart, -margin),
    windowTo: dayKeyPlus(nextStart, margin),
    daysUntilNext,
    ovulationDay: ovulation,
    periodEndsOn:
      current && !current.endDay
        ? dayKeyPlus(current.startDay, Math.max(0, stats.periodLength - 1))
        : null,
  };
}

export interface PhaseMeta {
  key: Phase;
  label: string;
  emoji: string;
  color: string;
  soft: string;
  mood: string; // what this stretch usually feels like
  her: string[]; // what tends to help her
  him: string[]; // what he can actually do
}

const PHASES: Record<Phase, PhaseMeta> = {
  menstrual: {
    key: 'menstrual',
    label: 'bleeding',
    emoji: '🌹',
    color: '#E8637C',
    soft: '#FDE8EC',
    mood: 'tired, tender, running on low battery',
    her: ['warmth on the cramps', 'iron and water', 'sleep without guilt', 'nothing heavy today'],
    him: ['hot water bag ready', 'make the food happen', 'take the chores', 'zero arguments'],
  },
  follicular: {
    key: 'follicular',
    label: 'rising',
    emoji: '🌱',
    color: '#7FD1BE',
    soft: '#E3F6F1',
    mood: 'energy coming back, head clearing',
    her: ['good week to start things', 'workouts feel easier', 'protein and sunlight'],
    him: ['plan the fun stuff now', 'say yes to her ideas', 'gym together'],
  },
  ovulation: {
    key: 'ovulation',
    label: 'peak',
    emoji: '✨',
    color: '#F5B941',
    soft: '#FCF1DA',
    mood: 'brightest, most social, most confident',
    her: ['hydrate more than usual', 'the big conversations land well now'],
    him: ['take her out', 'flirt like it is day one', 'this is the easy week, use it'],
  },
  luteal: {
    key: 'luteal',
    label: 'winding down',
    emoji: '🌙',
    color: '#9B7EDE',
    soft: '#EEE9FA',
    mood: 'slower, hungrier, less patience for noise',
    her: ['earlier nights', 'magnesium and real meals', 'fewer commitments'],
    him: ['keep snacks stocked', 'lower the noise', 'do not schedule stress'],
  },
  pms: {
    key: 'pms',
    label: 'tender days',
    emoji: '🤍',
    color: '#F2789F',
    soft: '#FDE8EF',
    mood: 'cramps building, mood swinging, everything louder',
    her: ['chocolate is medicine', 'cry if you need to', 'no big decisions'],
    him: ['extra gentle, zero teasing', 'bring the chocolate first', 'reassure, do not fix', 'let it pass'],
  },
  unknown: {
    key: 'unknown',
    label: 'not tracking yet',
    emoji: '🌸',
    color: '#B0688A',
    soft: '#FDE8EF',
    mood: 'log the first period and the rest learns itself',
    her: [],
    him: [],
  },
};

export function phaseMeta(phase: Phase): PhaseMeta {
  return PHASES[phase] ?? PHASES.unknown;
}

// The next few expected period starts, always FROM TODAY FORWARD. A history
// that stopped months ago would otherwise keep predicting into the past.
export function upcomingStarts(
  now0: CycleNow,
  stats: CycleStats,
  count = 2,
  now = Date.now()
): string[] {
  if (!now0.nextStart) return [];
  const today = utcDayKey(now);
  let anchor = now0.nextStart;
  // walk forward over however many cycles were missed (bounded, so a wild
  // date in the data can never spin here)
  for (let i = 0; i < 200 && anchor < today; i++) {
    anchor = dayKeyPlus(anchor, stats.cycleLength);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(dayKeyPlus(anchor, i * stats.cycleLength));
  return out;
}

// The ready-made nudges the partner can fire off. Phase-aware, because
// "drink water" during PMS and during peak week are different messages.
export function careNudges(phase: Phase, name: string): { label: string; message: string }[] {
  const her = name.trim() || 'love';
  const common = [
    { label: '🍲 eat something', message: `${her}, have you eaten? not a snack, actual food. go 🍲` },
    { label: '💧 drink water', message: `${her}, water break. right now, i am watching 💧` },
    { label: '😴 sleep early', message: `${her}, close the phone and sleep early tonight. i mean it 😴` },
  ];
  if (phase === 'menstrual')
    return [
      { label: '🔥 heat + rest', message: `${her}, hot bag on the cramps and lie down. i have got everything else today 🔥` },
      { label: '💊 painkiller?', message: `${her}, did you take something for the pain? do not tough it out 💊` },
      ...common,
    ];
  if (phase === 'pms')
    return [
      { label: '🍫 chocolate run', message: `${her}, say the word and chocolate appears. no questions 🍫` },
      { label: '🫶 you are okay', message: `${her}, whatever you are feeling today is allowed. i am not going anywhere 🫶` },
      ...common,
    ];
  if (phase === 'ovulation')
    return [
      { label: '💃 go out tonight', message: `${her}, you are glowing this week. dinner tonight? my treat 💃` },
      ...common,
    ];
  if (phase === 'follicular')
    return [
      { label: '🏃 gym together', message: `${her}, your energy is up this week. gym with me? 🏃` },
      ...common,
    ];
  return [
    { label: '🌙 slow down', message: `${her}, slow week. do less, rest more, let me handle the rest 🌙` },
    ...common,
  ];
}

export const FLOW_LEVELS = [
  { key: 'spotting', label: 'spotting', dots: 1 },
  { key: 'light', label: 'light', dots: 1 },
  { key: 'medium', label: 'medium', dots: 2 },
  { key: 'heavy', label: 'heavy', dots: 3 },
] as const;

export const SYMPTOMS = [
  'cramps',
  'headache',
  'bloating',
  'backache',
  'nausea',
  'sore chest',
  'exhausted',
  'acne',
  'cravings',
  'dizzy',
  'insomnia',
];

export const CYCLE_MOODS = ['okay', 'tired', 'low', 'irritable', 'weepy', 'anxious', 'happy'];

// Human date, no year noise: "Tue, 14 Oct".
export function prettyDay(day: string | null): string {
  if (!day) return '';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
