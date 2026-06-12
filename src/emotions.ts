import { EmotionKey } from './types';

export type MouthShape = 'smile' | 'grin' | 'frown' | 'flat' | 'open' | 'wavy';

export interface EmotionMeta {
  key: EmotionKey;
  label: string;
  color: string; // main blob color
  deep: string; // darker shade for features
  soft: string; // pastel background tint
  mouth: MouthShape;
  brows: 'none' | 'angry' | 'sad' | 'raised';
  blush: boolean;
  tagline: string;
}

export const EMOTIONS: Record<EmotionKey, EmotionMeta> = {
  joy: {
    key: 'joy',
    label: 'Joy',
    color: '#FFC93C',
    deep: '#B8860B',
    soft: '#FFF4D6',
    mouth: 'grin',
    brows: 'none',
    blush: true,
    tagline: 'light on its feet',
  },
  sadness: {
    key: 'sadness',
    label: 'Sadness',
    color: '#6C9BD1',
    deep: '#2F5C8F',
    soft: '#E3EDF9',
    mouth: 'frown',
    brows: 'sad',
    blush: false,
    tagline: 'soft and heavy',
  },
  anger: {
    key: 'anger',
    label: 'Anger',
    color: '#E25C5C',
    deep: '#8F2B2B',
    soft: '#FBE3E3',
    mouth: 'frown',
    brows: 'angry',
    blush: false,
    tagline: 'a small fire',
  },
  fear: {
    key: 'fear',
    label: 'Fear',
    color: '#9B7EDE',
    deep: '#5B3FA0',
    soft: '#EFE9FB',
    mouth: 'open',
    brows: 'raised',
    blush: false,
    tagline: 'wide-eyed and alert',
  },
  calm: {
    key: 'calm',
    label: 'Calm',
    color: '#6FCF97',
    deep: '#2E7D52',
    soft: '#E4F7ED',
    mouth: 'smile',
    brows: 'none',
    blush: false,
    tagline: 'still water',
  },
  love: {
    key: 'love',
    label: 'Love',
    color: '#F2789F',
    deep: '#A93B62',
    soft: '#FDE8EF',
    mouth: 'smile',
    brows: 'none',
    blush: true,
    tagline: 'warm at the center',
  },
  wonder: {
    key: 'wonder',
    label: 'Wonder',
    color: '#F2994A',
    deep: '#9C5A1B',
    soft: '#FDEEDF',
    mouth: 'open',
    brows: 'raised',
    blush: true,
    tagline: 'eyes full of questions',
  },
  disgust: {
    key: 'disgust',
    label: 'Disgust',
    color: '#8FBC5A',
    deep: '#4E7026',
    soft: '#EFF6E3',
    mouth: 'wavy',
    brows: 'angry',
    blush: false,
    tagline: 'politely unimpressed',
  },
};

export const EMOTION_KEYS = Object.keys(EMOTIONS) as EmotionKey[];

export function emotionMeta(key: EmotionKey | undefined | null): EmotionMeta {
  return (key && EMOTIONS[key]) || EMOTIONS.calm;
}

// Hawkins-style consciousness frequencies for each emotion.
export const HAWKINS: Record<EmotionKey, number> = {
  joy: 540,
  love: 500,
  wonder: 400,
  calm: 350,
  disgust: 175,
  anger: 150,
  fear: 100,
  sadness: 75,
};

export interface ConsciousnessLevel {
  min: number;
  label: string;
  color: string;
}

// Ascending map of consciousness, colored bottom (red) to top (violet).
export const CONSCIOUSNESS_LEVELS: ConsciousnessLevel[] = [
  { min: 20, label: 'Shame', color: '#8F2B2B' },
  { min: 30, label: 'Guilt', color: '#A93B3B' },
  { min: 50, label: 'Apathy', color: '#C84A4A' },
  { min: 75, label: 'Grief', color: '#E25C5C' },
  { min: 100, label: 'Fear', color: '#E2785C' },
  { min: 125, label: 'Desire', color: '#F2994A' },
  { min: 150, label: 'Anger', color: '#F5B041' },
  { min: 175, label: 'Pride', color: '#F5C541' },
  { min: 200, label: 'Courage', color: '#E3D34B' },
  { min: 250, label: 'Neutrality', color: '#B8D45C' },
  { min: 310, label: 'Willingness', color: '#8FBC5A' },
  { min: 350, label: 'Acceptance', color: '#6FCF97' },
  { min: 400, label: 'Reason', color: '#4FB0A5' },
  { min: 500, label: 'Love', color: '#6C9BD1' },
  { min: 540, label: 'Joy', color: '#7E8BE8' },
  { min: 600, label: 'Peace', color: '#9B7EDE' },
  { min: 700, label: 'Enlightenment', color: '#8E5CF0' },
];

export function consciousnessLevel(value: number): ConsciousnessLevel {
  let level = CONSCIOUSNESS_LEVELS[0];
  for (const l of CONSCIOUSNESS_LEVELS) {
    if (value >= l.min) level = l;
  }
  return level;
}

// 0..1 position on the ladder, for placing markers on the gradient bar.
export function frequencyPercent(value: number): number {
  return Math.max(0, Math.min(1, (value - 20) / (700 - 20)));
}
