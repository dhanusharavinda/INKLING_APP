import AsyncStorage from '@react-native-async-storage/async-storage';
import { CanvasItem, PairGameState } from '../types';

// Widgets render from these caches. The app refreshes them whenever pair data
// syncs; the widgets' periodic headless updates also refresh them when online.

const K_DOODLE = '@inkling/widget/doodle';
const K_GAME = '@inkling/widget/game';

export interface DoodleWidgetData {
  paired: boolean;
  pairId: string | null;
  items: CanvasItem[];
  statusLine?: string | null; // "💗 you + Mia are holding hands"
  updatedAt: number;
}

export interface GameWidgetData {
  paired: boolean;
  pairId: string | null;
  game: PairGameState | null;
  iAmUserA?: boolean; // for the personal 60-cap in optimistic widget taps
  updatedAt: number;
}

async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // cache only; widgets fall back to their empty state
  }
}

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const saveDoodleWidgetData = (d: DoodleWidgetData) => save(K_DOODLE, d);
export const readDoodleWidgetData = () => read<DoodleWidgetData>(K_DOODLE);
export const saveGameWidgetData = (d: GameWidgetData) => save(K_GAME, d);
export const readGameWidgetData = () => read<GameWidgetData>(K_GAME);

// Taps made on the widget that have not reached the server yet (offline or
// mid-flight). They render instantly and flush in batches.
const K_PENDING = '@inkling/widget/pendingTaps';

export async function readPendingTaps(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(K_PENDING);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function savePendingTaps(n: number): Promise<void> {
  try {
    await AsyncStorage.setItem(K_PENDING, String(Math.max(0, n)));
  } catch {
    // best effort
  }
}
