import React, { useRef } from 'react';
import type { PressHoldProps } from './PressHold';

// Browser press-and-hold. The whole point is setPointerCapture: once the
// pointer is captured, this element keeps receiving move/up events even if
// the cursor drifts off it, so a slow hand never cancels the hold. That is
// what react-native-web's Pressable could not do (it treats a few pixels of
// movement as "press cancelled", which reset the seal mid-hold).

export default function PressHold({ onStart, onEnd, disabled, children }: PressHoldProps) {
  const held = useRef(false);

  const begin = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || held.current) return;
    held.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture unsupported; the hold still works while the pointer stays put
    }
    onStart();
  };

  const finish = () => {
    if (!held.current) return;
    held.current = false;
    onEnd();
  };

  return (
    <div
      onPointerDown={begin}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // a long press must not scroll the page, select text, or pop the
        // iOS/Android callout menu
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </div>
  );
}
