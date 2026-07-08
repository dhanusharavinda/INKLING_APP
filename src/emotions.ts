import { EmotionKey } from './types';
import { mixHex } from './theme';

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
  anguish: {
    key: 'anguish',
    label: 'Anguish',
    color: '#7E2B3C',
    deep: '#4A1622',
    soft: '#EFD9DE',
    mouth: 'open',
    brows: 'angry',
    blush: false,
    tagline: 'raw pain that wants out',
  },
  confusion: {
    key: 'confusion',
    label: 'Confusion',
    color: '#9A8FB0',
    deep: '#564A6E',
    soft: '#ECE8F2',
    mouth: 'wavy',
    brows: 'raised',
    blush: false,
    tagline: 'tangled and unsure',
  },
  peace: {
    key: 'peace',
    label: 'Peace',
    color: '#B7A7E6',
    deep: '#5E4C9E',
    soft: '#F1ECFB',
    mouth: 'smile',
    brows: 'none',
    blush: true,
    tagline: 'whole, and enough',
  },
};

export const EMOTION_KEYS = Object.keys(EMOTIONS) as EmotionKey[];

// Little glyphs for places that cannot render the blob avatars (widgets, toasts).
export const EMOTION_EMOJI: Record<EmotionKey, string> = {
  joy: '☀️',
  sadness: '💧',
  anger: '🔥',
  fear: '😟',
  calm: '🍃',
  love: '💗',
  wonder: '✨',
  disgust: '🙃',
  anguish: '💔',
  confusion: '🌀',
  peace: '🕊️',
};

export function emotionMeta(key: EmotionKey | undefined | null): EmotionMeta {
  return (key && EMOTIONS[key]) || EMOTIONS.calm;
}

// Hawkins-style consciousness frequencies for each emotion.
export const HAWKINS: Record<EmotionKey, number> = {
  peace: 700,
  joy: 540,
  love: 500,
  wonder: 400,
  calm: 350,
  disgust: 175,
  anger: 150,
  fear: 100,
  confusion: 90,
  sadness: 75,
  anguish: 30,
};

export interface ConsciousnessLevel {
  min: number;
  label: string;
  color: string;
}

// Ascending map of consciousness, colored as a smooth spectrum from a deep
// low-frequency red through gold and green up to a high-frequency violet.
export const CONSCIOUSNESS_LEVELS: ConsciousnessLevel[] = [
  { min: 20, label: 'Shame', color: '#6B2737' },
  { min: 30, label: 'Guilt', color: '#8A3344' },
  { min: 50, label: 'Apathy', color: '#A8434B' },
  { min: 75, label: 'Grief', color: '#C25E5E' },
  { min: 100, label: 'Fear', color: '#D9774F' },
  { min: 125, label: 'Desire', color: '#E89A4C' },
  { min: 150, label: 'Anger', color: '#F0B43F' },
  { min: 175, label: 'Pride', color: '#EFC93E' },
  { min: 200, label: 'Courage', color: '#DDD24A' },
  { min: 250, label: 'Neutrality', color: '#AFCF5E' },
  { min: 310, label: 'Willingness', color: '#7FC98C' },
  { min: 350, label: 'Acceptance', color: '#5FC9A6' },
  { min: 400, label: 'Reason', color: '#4FB5C0' },
  { min: 500, label: 'Love', color: '#6C8FE0' },
  { min: 540, label: 'Joy', color: '#9B7EE0' },
  { min: 600, label: 'Peace', color: '#B07BE0' },
  { min: 700, label: 'Enlightenment', color: '#C77BE8' },
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

// The color a given frequency carries on the consciousness spectrum, smoothly
// interpolated between ladder stops. This is what makes Fear (100 Hz) read as a
// warm orange-red and Joy/Peace (540-700) read violet, matching the Hawkins map.
export function frequencyColor(value: number): string {
  const L = CONSCIOUSNESS_LEVELS;
  if (value <= L[0].min) return L[0].color;
  if (value >= L[L.length - 1].min) return L[L.length - 1].color;
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i];
    const b = L[i + 1];
    if (value >= a.min && value <= b.min) {
      const t = (value - a.min) / (b.min - a.min);
      return mixHex([
        { hex: a.color, weight: 1 - t },
        { hex: b.color, weight: t },
      ]);
    }
  }
  return L[L.length - 1].color;
}

// The frequency-spectrum color for an emotion (by its Hawkins value).
export function emotionFrequencyColor(emotion: EmotionKey): string {
  return frequencyColor(HAWKINS[emotion]);
}

// The aura color is the weighted blend of the FREQUENCY colors a person has
// felt, so it sits at the true mixed point on the consciousness spectrum.
export function auraColor(counts: Map<EmotionKey, number> | Record<string, number>): string {
  const entries =
    counts instanceof Map ? [...counts.entries()] : (Object.entries(counts) as [EmotionKey, number][]);
  const items = entries
    .filter(([k]) => !!EMOTIONS[k as EmotionKey])
    .map(([k, c]) => ({ hex: frequencyColor(HAWKINS[k as EmotionKey]), weight: c }));
  return mixHex(items, frequencyColor(HAWKINS.calm));
}
