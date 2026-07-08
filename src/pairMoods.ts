// The couple layer's shared vocabulary: moods you can be in, reactions that
// answer a mood, the combined "you two right now" status line, and the daily
// question deck. Everything is keyed by plain strings stored in pair_events.

export interface PairMood {
  key: string;
  emoji: string;
  label: string; // "mishing you"
  feels: string; // "{name} is mishing you"
}

export const PAIR_MOODS: PairMood[] = [
  { key: 'love', emoji: '💗', label: 'love', feels: 'feels love' },
  { key: 'joy', emoji: '☀️', label: 'happy', feels: 'feels happy' },
  { key: 'calm', emoji: '🍃', label: 'calm', feels: 'feels calm' },
  { key: 'tired', emoji: '🥱', label: 'tired', feels: 'feels tired' },
  { key: 'mishing', emoji: '🥺', label: 'mishing you', feels: 'is mishing you' },
  { key: 'cuteagg', emoji: '😤', label: 'cute aggression', feels: 'wants to squish you' },
  { key: 'sadness', emoji: '💧', label: 'sad', feels: 'feels sad' },
  { key: 'anger', emoji: '🔥', label: 'grumpy', feels: 'feels grumpy' },
];

// Legacy / journal-emotion values that may still arrive from older builds.
const EXTRA_MOODS: PairMood[] = [
  { key: 'wonder', emoji: '✨', label: 'wonder', feels: 'feels wonder' },
  { key: 'fear', emoji: '😟', label: 'worried', feels: 'feels worried' },
  { key: 'peace', emoji: '🕊️', label: 'at peace', feels: 'feels at peace' },
  { key: 'anguish', emoji: '💔', label: 'hurting', feels: 'is hurting' },
  { key: 'confusion', emoji: '🌀', label: 'confused', feels: 'feels confused' },
  { key: 'disgust', emoji: '🙃', label: 'unimpressed', feels: 'feels unimpressed' },
];

export function moodMeta(key: string | undefined | null): PairMood | null {
  if (!key) return null;
  return PAIR_MOODS.find((m) => m.key === key) ?? EXTRA_MOODS.find((m) => m.key === key) ?? null;
}

export interface ReactionDef {
  key: string;
  emoji: string;
  label: string; // button: "squish them back"
  together: string; // status: "squishing each other"
}

const R = (key: string, emoji: string, label: string, together: string): ReactionDef => ({
  key,
  emoji,
  label,
  together,
});

const HUG = R('hug', '🫂', 'hug', 'hugging each other');
const HOLD = R('hold', '💗', 'hold hands', 'holding hands');
const SPARKLE = R('sparkle', '✨', 'cherish', 'cherishing each other');
const TEA = R('tea', '🍵', 'sip tea together', 'sipping tea together');
const CHILL = R('chill', '🧊', 'chill', 'chilling together');
const POKE = R('poke', '👉', 'poke', 'poking each other');
const CHOCO = R('choco', '🍫', 'send chocolate', 'sharing chocolate');
const CANDLE = R('candle', '🕯️', 'stay close', 'staying close');
// comfort + reassurance, for the heavy days
const OKAY = R('okay', '🌈', 'everything will be okay', 'weathering it together');
const HERE = R('here', '🤍', "I'm here, tell me everything", 'talking it through');
const PROUD = R('proud', '🏅', 'so proud of you', 'celebrating each other');
const BREATHE = R('breathe', '🌬️', 'breathe with me', 'breathing together');
const SAFE = R('safe', '🏡', "you're safe with me", 'safe together');
const BLANKET = R('blanket', '🧸', 'blanket fort time', 'in a blanket fort');
const FLOWERS = R('flowers', '💐', 'send flowers', 'smelling the flowers');
const KISS = R('kiss', '😚', 'blow a kiss', 'blowing kisses');
const DANCE = R('dance', '🪩', 'dance it out', 'dancing it out');
const SNACK = R('snack', '🍜', 'bring snacks', 'sharing snacks');

const REACTIONS_BY_MOOD: Record<string, ReactionDef[]> = {
  love: [HOLD, KISS, SPARKLE, HUG, FLOWERS],
  joy: [R('cherish', '🎉', 'cherish together', 'cherishing together'), DANCE, PROUD, SPARKLE, POKE],
  calm: [TEA, BREATHE, SPARKLE, FLOWERS, POKE],
  tired: [R('tuck', '🛏️', 'tuck them in', 'tucked in together'), BLANKET, TEA, SNACK, HUG],
  mishing: [R('mishback', '🥺', 'mish you too', 'mishing each other'), KISS, HUG, HOLD, CANDLE],
  cuteagg: [
    R('squish', '🤗', 'squish them back', 'squishing each other'),
    R('fight', '🥊', 'play fight', 'play fighting'),
    R('bite', '🍪', 'offer a cookie instead', 'sharing cookies'),
    POKE,
  ],
  sadness: [HUG, OKAY, HERE, CHOCO, BLANKET],
  anger: [CHILL, HERE, TEA, BREATHE, HUG],
  wonder: [R('stars', '🔭', 'wonder along', 'stargazing together'), SPARKLE, DANCE, POKE],
  fear: [SAFE, HUG, OKAY, CANDLE, BREATHE],
  peace: [R('dove', '🕊️', 'breathe together', 'breathing together'), SPARKLE, TEA, FLOWERS],
  anguish: [HUG, HERE, OKAY, CANDLE, CHOCO],
  confusion: [R('compass', '🧭', 'figure it out together', 'figuring it out together'), HERE, HUG, TEA],
  disgust: [CHILL, TEA, SNACK, POKE],
};

const ALL_REACTIONS: ReactionDef[] = Object.values(REACTIONS_BY_MOOD).flat();

export function reactionsForMood(moodKey: string | undefined | null): ReactionDef[] {
  if (!moodKey) return [];
  return REACTIONS_BY_MOOD[moodKey] ?? [HUG, SPARKLE, POKE];
}

export function reactionMeta(key: string): ReactionDef | null {
  return ALL_REACTIONS.find((r) => r.key === key) ?? null;
}

// How long a reaction colors the couple status ("x + y are hugging").
export const REACTION_GLOW_MS = 3 * 60 * 60 * 1000;

// The one-line "you two right now", shown in the app header and the widget.
export function coupleStatusLine(opts: {
  partnerName: string;
  myMoodKey?: string | null;
  partnerMoodKey?: string | null;
  lastReactionKey?: string | null;
  lastReactionAt?: number | null;
  now?: number;
}): string | null {
  const now = opts.now ?? Date.now();
  const who = opts.partnerName.trim() || 'your person';
  if (
    opts.lastReactionKey &&
    opts.lastReactionAt &&
    now - opts.lastReactionAt < REACTION_GLOW_MS
  ) {
    const r = reactionMeta(opts.lastReactionKey);
    if (r) return `${r.emoji} you + ${who} are ${r.together}`;
  }
  const mine = moodMeta(opts.myMoodKey);
  const theirs = moodMeta(opts.partnerMoodKey);
  if (mine && theirs && mine.key === theirs.key) {
    return `${mine.emoji} you both ${mine.feels.replace('is ', 'are ').replace('feels', 'feel')}`;
  }
  if (mine && theirs) return `${theirs.emoji} ${who} ${theirs.feels} · ${mine.emoji} you too?`;
  if (theirs) return `${theirs.emoji} ${who} ${theirs.feels}`;
  if (mine) return `${mine.emoji} you ${mine.feels.replace('is ', 'are ').replace('feels', 'feel')}`;
  return null;
}

// ---------- daily question (answer apart, reveal together) ----------

export const ANSWER_REACTIONS = ['😍', '😂', '😮', '🥹', '💯'];

export const QUESTIONS: string[] = [
  "What's a tiny moment with me you replay in your head?",
  "What's a fear you have that you've never said out loud to me?",
  'What song feels like us right now?',
  'What did you almost text me today but didn’t?',
  'When did you last feel really proud of me?',
  "What's one thing I do that instantly calms you down?",
  'If we could teleport anywhere for one evening, where are we going?',
  "What's a smell that reminds you of me?",
  'What do you think I worry about more than I should?',
  "What's the first thing you noticed about me?",
  'What would you want us to be doing exactly one year from today?',
  "What's something small I did that you never told me you loved?",
  'Which of my habits secretly makes you smile?',
  "What's a food you'd happily eat with me forever?",
  'When do you feel closest to me?',
  "What's a dream you've shelved that you'd pick back up if you could?",
  'What do you hope never changes about us?',
  "What's the best gift I could give you that costs nothing?",
  'What made you laugh hardest this month?',
  'If our love had a color today, what color is it and why?',
  "What's something you want us to try together, but keep forgetting to say?",
  'What part of your day do you wish I was there for?',
  "What's a memory of us you'd relive right now?",
  'What compliment do you wish you heard more often?',
  "What's one thing you're quietly proud of yourself for?",
  'If today had a soundtrack, what song was playing?',
  'What tiny thing can I do tomorrow to make your day softer?',
  "What's a question you wish I would ask you?",
  'Where do you feel safest?',
  "What's something new you learned about yourself lately?",
  'What are you looking forward to most right now?',
  "What's the most 'us' thing that happened this week?",
  'If we wrote a book together, what would it be about?',
  'What do you think our pet name for each other should secretly be?',
  "What's a hard day you got through that I never fully knew about?",
  'What would your perfect lazy day with me look like?',
  'What do you want to hear when you’re sad: solutions, silence, or softness?',
  "What's one way you've grown since we met?",
  'What silly hill are you prepared to die on?',
  'When did you last feel butterflies?',
];

// Same question for both people on a given day, varying by pair.
export function questionForDay(pairId: string, day: string): string {
  let h = 0;
  const s = `${pairId}:${day}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return QUESTIONS[h % QUESTIONS.length];
}
