import { Platform } from 'react-native';
import { CanvasItem, PairEvent, PairGameState, PairInfo } from '../types';
import { coupleStatusLine } from '../pairMoods';
import {
  DoodleWidgetData,
  GameWidgetData,
  saveDoodleWidgetData,
  saveGameWidgetData,
} from './widgetStore';

export function buildDoodleData(
  myUserId: string,
  pair: PairInfo | null,
  items: CanvasItem[],
  moods: PairEvent[],
  lastReaction: PairEvent | null
): DoodleWidgetData {
  const partnerName = pair ? (pair.userA === myUserId ? pair.nameB : pair.nameA) : '';
  const statusLine = pair
    ? coupleStatusLine({
        partnerName,
        myMoodKey: moods.find((m) => m.author === myUserId)?.value,
        partnerMoodKey: moods.find((m) => m.author !== myUserId)?.value,
        lastReactionKey: lastReaction?.value,
        lastReactionAt: lastReaction?.createdAt,
      })
    : null;
  return {
    paired: !!pair,
    pairId: pair?.id ?? null,
    items,
    statusLine,
    updatedAt: Date.now(),
  };
}

export function buildGameData(
  pair: PairInfo | null,
  game: PairGameState | null,
  myUserId: string
): GameWidgetData {
  return {
    paired: !!pair,
    pairId: pair?.id ?? null,
    game,
    iAmUserA: pair ? pair.userA === myUserId : true,
    updatedAt: Date.now(),
  };
}

// Save caches and redraw any placed widgets at their real size. No-ops off
// Android; never throws.
export async function refreshDoodleWidget(data: DoodleWidgetData): Promise<void> {
  await saveDoodleWidgetData(data);
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { DoodleWidget } = await import('./DoodleWidget');
    const React = await import('react');
    await requestWidgetUpdate({
      widgetName: 'UsDoodle',
      renderWidget: (info) =>
        React.createElement(DoodleWidget, { data, width: info.width, height: info.height }),
      widgetNotFound: () => {},
    });
  } catch {
    // widget module unavailable; cache stays fresh
  }
}

export async function refreshGameWidget(data: GameWidgetData): Promise<void> {
  await saveGameWidgetData(data);
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { TogetherWidget } = await import('./TogetherWidget');
    const React = await import('react');
    await requestWidgetUpdate({
      widgetName: 'UsTogether',
      renderWidget: (info) =>
        React.createElement(TogetherWidget, { data, width: info.width, height: info.height }),
      widgetNotFound: () => {},
    });
  } catch {
    // widget module unavailable; cache stays fresh
  }
}
