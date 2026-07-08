import React from 'react';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { itemsToSvg } from '../drawing';
import { DoodleWidgetData } from './widgetStore';

// Home-screen widget: the shared doodle page filling the widget, with the
// couple status ("you + Mia are holding hands") pinned at the bottom.
export function DoodleWidget({
  data,
  width = 150,
  height = 150,
}: {
  data: DoodleWidgetData | null;
  width?: number;
  height?: number;
}) {
  const items = data?.items ?? [];
  const moodLine = data?.statusLine ?? null;
  const side = Math.min(width, height);

  if (!data?.paired || items.length === 0) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: '#FFF7FA',
          borderRadius: 22,
          padding: 10,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget text="🎨" style={{ fontSize: 24 }} />
        <TextWidget
          text={data?.paired ? 'Your shared page is empty. Doodle!' : 'Link with your person in Inkling'}
          style={{ fontSize: 11, color: '#8B8294', marginTop: 6, textAlign: 'center' }}
        />
      </FlexWidget>
    );
  }

  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFF7FA',
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      {/* the page, as large as the widget allows */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SvgWidget svg={itemsToSvg(items)} style={{ width: side, height: side }} />
      </FlexWidget>
      {/* mood pill pinned at the bottom */}
      {moodLine && (
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
            text={moodLine}
            maxLines={1}
            style={{
              fontSize: 10,
              color: '#B0688A',
              fontWeight: '700',
              backgroundColor: 'rgba(255, 247, 250, 0.92)',
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          />
        </FlexWidget>
      )}
    </OverlapWidget>
  );
}
