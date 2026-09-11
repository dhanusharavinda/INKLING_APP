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
  rotation: number; // degrees, twisted into place with two fingers
}

// A paint-bucket layer: floods the whole page with a color at its z-order
// (everything drawn before it is covered; everything after sits on top).
export interface CanvasFill {
  kind: 'fill';
  id: string;
  author: string;
  color: string;
}

// A bucket-filled region (MS Paint style): its boundary rings as polygons in
// the 0..100 square. points is one ring; holes are the rest (a background
// fill around a closed drawing keeps the drawing as a hole). Rendered with
// even-odd fill so ring order never matters.
export interface CanvasShape {
  kind: 'shape';
  id: string;
  author: string;
  color: string;
  points: number[];
  holes?: number[][];
}

export type CanvasItem = CanvasStroke | CanvasText | CanvasFill | CanvasShape;

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
// (max 60 from one person), hitting the goal keeps the day streak alive.
// Every 10th streak day earns a 🛟 lifeguard; each lifeguard quietly rescues
// one fully-missed day, so the streak only breaks when none are left.
export interface PairGameState {
  taps: number;
  tapsA: number; // pair.userA's share today
  tapsB: number;
  day: string; // YYYY-MM-DD (UTC) the taps belong to
  streak: number;
  lastStreakDay: string;
  lastFreezeDay: string; // most recent day a lifeguard covered, '' if never
  lifeguards: number; // 🛟 saves in the bank
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

// One little message in the Daily dose of 💌 stream: an affirmation, a
// reassurance, anything — sent freely, never sealed.
export interface LoveNote {
  id: string;
  author: string;
  text: string;
  reaction: string; // the partner's emoji on this note, '' if none
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
  art: string | null; // ✨ Van Gogh repaint (PNG data URI), if one was made
  createdAt: number;
}

// ---------- accountability: promises kept with real camera snaps ----------

// A habit one person promised to keep; either partner may create or remove
// habits for either of the two (that is the accountability deal).
export interface PairHabit {
  id: string;
  pairId: string;
  owner: string; // who does the habit and sends the proof
  createdBy: string;
  title: string;
  emoji: string;
  remindAt: string; // 'HH:MM' on the owner's clock, '' = no reminder
  createdAt: number;
}

// One day's proof for a habit, without the heavy photo payload (that loads
// lazily via fetchProofPhoto when a proof is actually opened).
export interface HabitProofMeta {
  id: string;
  habitId: string;
  author: string;
  day: string; // YYYY-MM-DD (UTC)
  kind: 'photo' | 'skip';
  caption: string;
  skipReason: string;
  reaction: string; // the partner's emoji on this proof, '' if none
  createdAt: number;
}

// The "become better for love" pact: when each side signed (fingerprint
// press in the app), null while unsigned.
export interface PairPact {
  signedA: number | null;
  signedB: number | null;
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
  unlinkRequestedBy: string | null; // who asked to unlink; the other confirms
}
