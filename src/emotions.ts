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
