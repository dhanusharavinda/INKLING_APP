import { Platform } from 'react-native';

export const palette = {
  bg: '#FBF7F0',
  card: '#FFFFFF',
  ink: '#3A3340',
  inkSoft: '#8B8294',
  inkFaint: '#B8B1C0',
  line: '#F0E8DC',
  accent: '#7C6CF0',
  accentSoft: '#EEEBFD',
  gold: '#F5B941',
  goldSoft: '#FCF1DA',
  danger: '#E25C5C',
};

export const radius = {
  card: 24,
  chip: 999,
  input: 18,
};

export const serif = Platform.select({
  web: 'Georgia, "Times New Roman", serif',
  ios: 'Georgia',
  default: 'serif',
});

export const cardShadow = Platform.select({
  web: {
    boxShadow: '0 6px 24px rgba(58, 51, 64, 0.07)',
  } as object,
  default: {
    shadowColor: '#3A3340',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  } as object,
});
