export type EmotionKey =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'calm'
  | 'love'
  | 'wonder'
  | 'disgust';

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
}

export type TabKey = 'home' | 'compose' | 'insights' | 'settings';
