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
  accentDeep: '#5A47D6',
  gold: '#F5B941',
  goldSoft: '#FCF1DA',
  danger: '#E25C5C',
  dangerSoft: '#FBE3E3',
  // playful, Duolingo-ish accents
  mint: '#39C26F',
  mintSoft: '#E2F7EA',
  sky: '#4FA8E8',
  skySoft: '#E2F0FB',
};

export const radius = {
  card: 24,
  chip: 999,
  input: 18,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

// ---------- color helpers (for blended aura + tints) ----------

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Weighted average of several hex colors. Returns a single hex string.
export function mixHex(items: { hex: string; weight: number }[], fallback = '#9B8FE8'): string {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return fallback;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const it of items) {
    const w = Math.max(0, it.weight) / total;
    const c = hexToRgb(it.hex);
    r += c.r * w;
    g += c.g * w;
    b += c.b * w;
  }
  return rgbToHex(r, g, b);
}

// Mix a color toward white (amount 0..1) for soft tints.
export function tintHex(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, amount));
  return rgbToHex(c.r + (255 - c.r) * a, c.g + (255 - c.g) * a, c.b + (255 - c.b) * a);
}

// Mix a color toward black (amount 0..1) for deeper shades.
export function shadeHex(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, amount));
  return rgbToHex(c.r * (1 - a), c.g * (1 - a), c.b * (1 - a));
}

// Pick black or white text for legibility on a given background color.
export function readableTextOn(hex: string): string {
  const c = hexToRgb(hex);
  // perceived luminance (sRGB weights)
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.62 ? '#2D2433' : '#FFFFFF';
}

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
