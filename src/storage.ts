import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry, GameState, Settings } from './types';
import { defaultGame } from './gamification';

const K_ENTRIES = '@inkling/entries';
const K_GAME = '@inkling/game';
const K_SETTINGS = '@inkling/settings';
const K_SEEDED = '@inkling/seeded';

export function defaultSettings(): Settings {
  return { apiKey: '', autoTailor: true, name: '' };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export async function loadEntries(): Promise<Entry[]> {
  try {
    const raw = await AsyncStorage.getItem(K_ENTRIES);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Entry[]) : [];
  } catch {
    return [];
  }
}

export async function saveEntries(entries: Entry[]): Promise<void> {
  await AsyncStorage.setItem(K_ENTRIES, JSON.stringify(entries));
}

export async function loadGame(): Promise<GameState> {
  return readJson<GameState>(K_GAME, defaultGame());
}

export async function saveGame(game: GameState): Promise<void> {
  await AsyncStorage.setItem(K_GAME, JSON.stringify(game));
}

export async function loadSettings(): Promise<Settings> {
  return readJson<Settings>(K_SETTINGS, defaultSettings());
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}

export async function eraseAll(): Promise<void> {
  await AsyncStorage.multiRemove([K_ENTRIES, K_GAME, K_SETTINGS, K_SEEDED]);
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Sample entries (so the app feels alive on first open) ----------

const DAY = 86400000;

function sample(
  daysAgo: number,
  text: string,
  a: Entry['analysis'],
  inputType: Entry['inputType'] = 'text'
): Entry {
  return {
    id: makeId() + `-s${daysAgo}`,
    createdAt: Date.now() - daysAgo * DAY - (daysAgo * 37) % 9 * 3600000,
    text,
    inputType,
    tailored: inputType === 'voice',
    analysis: a,
    sample: true,
  };
}

export function buildSampleEntries(): Entry[] {
  return [
    sample(
      6,
      "Years ago I used to say money doesn't matter, only passion does. Today I caught myself negotiating hard for a raise — and I didn't feel guilty. I think money buys calm, and calm is what lets me be kind.",
      {
        emotion: 'wonder',
        secondary: 'calm',
        intensity: 62,
        tone: 'honest, mid-revision',
        mindset: 'You believe your past self was not wrong, just earlier — money has become a tool for peace, not a scoreboard.',
        thinkingStyle: 'You are comparing your past and present selves without shaming either one.',
        essence: 'Money buys calm, and calm lets me be kind.',
        reflection: 'A belief that updates with evidence is not a betrayal of who you were — it is proof you were paying attention.',
        philosopher: {
          name: 'Seneca',
          school: 'Stoicism',
          why: 'A wealthy Stoic who argued money is fine to hold as long as it does not hold you.',
        },
        source: 'local',
      }
    ),
    sample(
      5,
      "Rough day. The project I led got shelved and nobody even said thanks. I keep replaying the meeting. I know it shouldn't sting this much, but it does.",
      {
        emotion: 'sadness',
        secondary: 'anger',
        intensity: 74,
        tone: 'bruised, replaying the tape',
        mindset: 'You believe effort deserves acknowledgment, and today the world disagreed — the sting is the gap between those two.',
        thinkingStyle: 'You are looping on one moment, searching it for a verdict about yourself.',
        essence: "It shouldn't sting this much, but it does.",
        reflection: 'Let it sting tonight. The work was still real, even if the applause never arrived.',
        philosopher: {
          name: 'Marcus Aurelius',
          school: 'Stoicism',
          why: 'He reminded himself daily that praise is out of his control; the quality of effort is not.',
        },
        source: 'local',
      },
      'voice'
    ),
    sample(
      4,
      'Walked home the long way just to stay in the evening air a bit longer. No podcast, no phone. The city was loud but my head finally was not.',
      {
        emotion: 'calm',
        secondary: 'joy',
        intensity: 48,
        tone: 'slow and settled',
        mindset: 'You believe quiet is something you make, not something you wait for.',
        thinkingStyle: 'You are savoring instead of analyzing — letting an experience be enough.',
        essence: 'The city was loud but my head finally was not.',
        reflection: 'The long way home is rarely about the route.',
        philosopher: {
          name: 'Epicurus',
          school: 'Epicureanism',
          why: 'Finding luxury in an ordinary evening walk is his entire philosophy in one act.',
        },
        source: 'local',
      }
    ),
    sample(
      2,
      "What if the startup idea fails and I burn two years? But also — what if I'm 40 and still wondering? I keep flip-flopping. Maybe the fear is the signal that it matters.",
      {
        emotion: 'fear',
        secondary: 'wonder',
        intensity: 70,
        tone: 'restless, leaning forward',
        mindset: 'You believe regret-from-inaction now scares you more than failure — that is a new development.',
        thinkingStyle: 'You are running futures in both directions and noticing which one hurts more.',
        essence: 'Maybe the fear is the signal that it matters.',
        reflection: 'You are not flip-flopping; you are weighing two different versions of yourself. One of them is asking to exist.',
        philosopher: {
          name: 'Søren Kierkegaard',
          school: 'Existentialism',
          why: 'He called this exact dizziness "the anxiety of freedom" — fear felt at the edge of a real choice.',
        },
        source: 'local',
      },
      'voice'
    ),
    sample(
      1,
      "Mom called just to tell me she found the recipe I liked as a kid. We talked for an hour about nothing. I didn't know I needed that.",
      {
        emotion: 'love',
        secondary: 'joy',
        intensity: 66,
        tone: 'warm, caught off guard',
        mindset: 'You believe connection sneaks in through small doors — an hour about nothing was actually about everything.',
        thinkingStyle: 'You are noticing needs only after they are met, and wondering what else you are missing.',
        essence: "I didn't know I needed that.",
        reflection: 'Some calls are recipes too — instructions for a feeling you forgot how to make alone.',
        philosopher: {
          name: 'Confucius',
          school: 'Confucianism',
          why: 'He held that the deepest philosophy lives inside ordinary family rituals, like a recipe passed down.',
        },
        source: 'local',
      }
    ),
  ];
}

export async function seedIfFirstRun(existing: Entry[]): Promise<Entry[] | null> {
  const seeded = await AsyncStorage.getItem(K_SEEDED);
  if (seeded || existing.length > 0) return null;
  const samples = buildSampleEntries();
  await saveEntries(samples);
  await AsyncStorage.setItem(K_SEEDED, '1');
  return samples;
}
