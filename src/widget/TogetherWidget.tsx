import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import {
  birdImageFor,
  effectiveStreak,
  GAME_GOAL,
  goalReachedToday,
  tapsToday,
} from '../gameScene';
import { GameWidgetData } from './widgetStore';

const ART_RATIO = 393 / 187; // the bird frames' aspect

// Home-screen widget: the birds fill the whole frame (cover-cropped to the
// widget's real size), one tiny status pill at the bottom. Tapping the widget
// IS a tap in the game.
export function TogetherWidget({
  data,
  width = 250,
  height = 120,
}: {
  data: GameWidgetData | null;
  width?: number;
  height?: number;
}) {
  if (!data?.paired) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: '#2A2140',
          borderRadius: 22,
          padding: 12,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget text="🐦🐦" style={{ fontSize: 22 }} />
        <TextWidget
          text="Link with your person in Inkling"
          style={{ fontSize: 11, color: '#B8B1C0', marginTop: 6, textAlign: 'center' }}
        />
      </FlexWidget>
    );
  }

  const taps = tapsToday(data.game);
  const reached = goalReachedToday(data.game);
  const streak = effectiveStreak(data.game);
  const caption = reached
    ? `snuggled ✓${streak > 0 ? `  ·  🔥 ${streak}` : ''}`
    : `${taps}/${GAME_GOAL}${streak > 0 ? `  ·  🔥 ${streak}` : ''}  ·  tap!`;

  // cover-fit: scale the art so it fully covers width x height (excess crops)
  const imgW = Math.max(width, Math.round(height * ART_RATIO));
  const imgH = Math.max(height, Math.round(width / ART_RATIO));

  return (
    <OverlapWidget
      clickAction="GAME_TAP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        borderRadius: 22,
        backgroundColor: '#2A2140',
        overflow: 'hidden',
      }}
    >
      <ImageWidget
        image={birdImageFor(taps, reached)}
        imageWidth={imgW}
        imageHeight={imgH}
        radius={22}
        style={{ width: 'match_parent', height: 'match_parent' }}
      />
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: 6,
        }}
      >
        <TextWidget
          text={caption}
          maxLines={1}
          style={{
            fontSize: 10,
            color: '#FFF6EC',
            fontWeight: '700',
            backgroundColor: 'rgba(42, 33, 64, 0.72)',
            paddingHorizontal: 9,
            paddingVertical: 3,
            borderRadius: 999,
          }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}
