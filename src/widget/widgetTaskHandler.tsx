import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DoodleWidget } from './DoodleWidget';
import { TogetherWidget } from './TogetherWidget';
import {
  DoodleWidgetData,
  GameWidgetData,
  readDoodleWidgetData,
  readGameWidgetData,
  readPendingTaps,
  saveDoodleWidgetData,
  saveGameWidgetData,
  savePendingTaps,
} from './widgetStore';
import { buildDoodleData, buildGameData } from './widgetSync';
import { optimisticTaps } from '../gameScene';
import {
  fetchCanvas,
  fetchLatestEvent,
  fetchLatestMoods,
  fetchMyPair,
  fetchPairGame,
  gameTap,
  getSession,
} from '../cloud';

// Periodic/headless refresh: try fresh data, fall back to the cached payload
// on any failure (offline, signed out, cloud not configured).

async function freshDoodle(): Promise<DoodleWidgetData | null> {
  const cached = await readDoodleWidgetData();
  try {
    const session = await getSession();
    if (!session) return cached;
    const pair = await fetchMyPair();
    if (!pair) return buildDoodleData(session.userId, null, [], [], null);
    const [items, moods, lastReaction] = await Promise.all([
      fetchCanvas(pair.id),
      fetchLatestMoods(pair.id, [pair.userA, pair.userB].filter(Boolean) as string[]),
      fetchLatestEvent(pair.id, 'reaction'),
    ]);
    const fresh = buildDoodleData(session.userId, pair, items, moods, lastReaction);
    await saveDoodleWidgetData(fresh);
    return fresh;
  } catch {
    return cached;
  }
}

// Send any taps that have not reached the server yet, then return fresh state.
async function flushPendingTaps(): Promise<GameWidgetData | null> {
  const cached = await readGameWidgetData();
  const pending = await readPendingTaps();
  if (pending <= 0) return null;
  try {
    const game = await gameTap(Math.min(25, pending));
    const stillPending = Math.max(0, (await readPendingTaps()) - pending);
    await savePendingTaps(stillPending);
    const data: GameWidgetData = {
      paired: true,
      pairId: cached?.pairId ?? null,
      iAmUserA: cached?.iAmUserA ?? true,
      game:
        stillPending > 0 ? optimisticTaps(game, stillPending, cached?.iAmUserA ?? true) : game,
      updatedAt: Date.now(),
    };
    await saveGameWidgetData(data);
    return data;
  } catch {
    return null; // offline: taps stay pending for the next attempt
  }
}

async function freshGame(): Promise<GameWidgetData | null> {
  const cached = await readGameWidgetData();
  try {
    const flushed = await flushPendingTaps();
    if (flushed) return flushed;
    const session = await getSession();
    if (!session) return cached;
    const pair = await fetchMyPair();
    if (!pair) return buildGameData(null, null, session.userId);
    const game = await fetchPairGame(pair.id);
    const fresh = buildGameData(pair, game, session.userId);
    await saveGameWidgetData(fresh);
    return fresh;
  } catch {
    return cached;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  const dims = { width: props.widgetInfo.width, height: props.widgetInfo.height };

  if (name === 'UsDoodle') {
    switch (props.widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED':
      case 'WIDGET_CLICK': {
        const data = await freshDoodle();
        props.renderWidget(<DoodleWidget data={data} {...dims} />);
        break;
      }
      default:
        break;
    }
    return;
  }

  if (name === 'UsTogether') {
    switch (props.widgetAction) {
      case 'WIDGET_ADDED':
      case 'WIDGET_UPDATE':
      case 'WIDGET_RESIZED': {
        const data = await freshGame();
        props.renderWidget(<TogetherWidget data={data} {...dims} />);
        break;
      }
      case 'WIDGET_CLICK': {
        if (props.clickAction !== 'GAME_TAP') break;
        // 1) render the tap INSTANTLY from cache (no network in the hot path)
        const cached = await readGameWidgetData();
        const optimistic: GameWidgetData = {
          paired: cached?.paired ?? true,
          pairId: cached?.pairId ?? null,
          iAmUserA: cached?.iAmUserA ?? true,
          game: optimisticTaps(cached?.game ?? null, 1, cached?.iAmUserA ?? true),
          updatedAt: Date.now(),
        };
        await saveGameWidgetData(optimistic);
        props.renderWidget(<TogetherWidget data={optimistic} {...dims} />);
        // 2) queue the tap and flush the batch in the background
        await savePendingTaps((await readPendingTaps()) + 1);
        const flushed = await flushPendingTaps();
        // 3) only redraw if the server materially disagrees (prevents flicker)
        if (
          flushed?.game &&
          optimistic.game &&
          (flushed.game.taps !== optimistic.game.taps ||
            flushed.game.streak !== optimistic.game.streak)
        ) {
          props.renderWidget(<TogetherWidget data={flushed} {...dims} />);
        }
        break;
      }
      default:
        break;
    }
  }
}
