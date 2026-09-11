import React from 'react';
import { Pressable, ViewStyle } from 'react-native';

// A press-and-hold surface. Native uses Pressable, whose press lifecycle is
// exactly what a long hold needs. The browser build resolves PressHold.web,
// which uses raw pointer capture instead: react-native-web cancels a press
// on the slightest pointer drift, which made a 5-second hold impossible to
// finish with a mouse.

export interface PressHoldProps {
  onStart: () => void;
  onEnd: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}

export default function PressHold({ onStart, onEnd, disabled, style, children }: PressHoldProps) {
  return (
    <Pressable onPressIn={onStart} onPressOut={onEnd} disabled={disabled} style={style}>
      {children}
    </Pressable>
  );
}
