export type EmotionKey =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'calm'
  | 'love'
  | 'wonder'
  | 'disgust'
  | 'anguish'
  | 'confusion'
  | 'peace';

export interface PhilosopherMatch {
  name: string;
  school: string;
  why: string;
}

export interface Analysis {
  emotion: EmotionKey;
  secondary?: EmotionKey | null;
  intensity: number; // 0..100
  tone: string; // "quietly hopeful", "restless but determined"
  mindset: string; // snapshot of current mindset
  thinkingStyle: string; // way of thinking in this entry
  essence: string; // one-line philosophical essence
  reflection: string; // short, gentle philosophical reflection
  philosopher?: PhilosopherMatch | null;
  themes?: string[]; // 1-3 short lowercase topics, e.g. ["money", "career"]
  source: 'ai' | 'local';
}

export interface Entry {
  id: string;
  createdAt: number;
  text: string;
  rawTranscript?: string;
  inputType: 'text' | 'voice';
  tailored: boolean;
  analysis: Analysis;
  sample?: boolean;
}

export interface GameState {
  xp: number;
  streak: number;
  bestStreak: number;
  lastEntryDay: string | null; // YYYY-MM-DD
  badges: string[];
}

export interface Settings {
  apiKey: string;
  autoTailor: boolean;
  name: string;
  onboarded: boolean;
}

export type TabKey = 'home' | 'compose' | 'insights' | 'settings';

// ---------- couples / friends collab ----------

// One drawn line: color + width + flat [x1,y1,x2,y2,...] in a 0..100 square.
export interface Stroke {
  color: string;
  width: number;
  points: number[];
}

// A stroke on the shared pair canvas (one row each, streamed live).
export interface CanvasStroke extends Stroke {
  kind: 'stroke';
  id: string;
  author: string; // user id
}

// A text/emoji sticker placed on the canvas, Instagram-style.
export interface CanvasText {
  kind: 'text';
  id: string;
  author: string;
  text: string;
  x: number; // 0..100 canvas space, center of the text
  y: number;
  size: number; // font size in canvas units
  color: string;
}

// A paint-bucket layer: floods the whole page with a color at its z-order
// (everything drawn before it is covered; everything after sits on top).
export interface CanvasFill {
  kind: 'fill';
  id: string;
  author: string;
  color: string;
}

export type CanvasItem = CanvasStroke | CanvasText | CanvasFill;

// A mood ("I'm feeling joy"), a comfort reaction, or a shared link.
export interface PairEvent {
  id: string;
  pairId: string;
  author: string;
  kind: 'mood' | 'reaction' | 'link';
  value: string; // mood key, reaction key, or an https URL
  createdAt: number;
}

// The shared tap-game state: 100 combined taps a day keeps the birds close
// (max 60 from one person), hitting the goal keeps the day streak alive, and
// one weekly streak-freeze quietly covers a single missed day.
export interface PairGameState {
  taps: number;
  tapsA: number; // pair.userA's share today
  tapsB: number;
  day: string; // YYYY-MM-DD (UTC) the taps belong to
  streak: number;
  lastStreakDay: string;
  lastFreezeDay: string; // day a freeze covered, '' if never
  updatedAt: number;
}

// Tiny tic-tac-toe: userA plays X (💗), userB plays O (⭐).
export interface XoState {
  board: string; // 9 chars of '.', 'X', 'O'
  nextTurn: 'X' | 'O';
  winner: '' | 'X' | 'O' | 'draw';
  winsA: number;
  winsB: number;
  updatedAt: number;
}

// One person's daily-question answer (+ their reaction to the partner's).
export interface PairAnswer {
  day: string;
  author: string;
  text: string;
  reaction: string; // emoji I gave THEIR answer, '' if none
  createdAt: number;
}

// A frozen memory: the doodle page + that day's Daily dose of 💌.
export interface PairSnap {
  id: string;
  author: string;
  day: string; // YYYY-MM-DD (UTC)
  items: CanvasItem[];
  question: string;
  answers: { author: string; text: string; reaction: string }[] | null;
  createdAt: number;
}

// Hangman: one plants a word, the other guesses; 6 wrongs wilts the flower.
export interface HangmanState {
  setter: string | null;
  word: string; // hidden in the UI from the guesser while playing
  guessed: string; // letters tried, in order
  wrongs: number;
  status: 'idle' | 'playing' | 'won' | 'lost';
  winsA: number;
  winsB: number;
  updatedAt: number;
}

// Rock paper scissors: choose in secret, reveal together.
export interface RpsState {
  myChoicePending: boolean; // I picked, waiting on them
  theirChoicePending: boolean;
  lastA: string;
  lastB: string;
  lastResult: '' | 'a' | 'b' | 'draw';
  winsA: number;
  winsB: number;
  draws: number;
  updatedAt: number;
}

export interface PairInfo {
  id: string;
  code: string;
  userA: string;
  userB: string | null;
  nameA: string;
  nameB: string;
}
