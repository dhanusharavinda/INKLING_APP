import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// react-native-web only; this file is picked exclusively for web builds, where
// 'react-native' resolves to react-native-web (which exports this helper).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { unstable_createElement } = require('react-native') as {
  unstable_createElement: (type: string, props: Record<string, unknown>) => React.ReactElement;
};
import { palette } from '../theme';
import type { DatePickerFieldProps } from './DatePickerField';

function toInputValue(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Browser-native <input type="date">, wrapped to match the native picker API.
export default function DatePickerField({ visible, value, onPick, onClose }: DatePickerFieldProps) {
  if (!visible) return null;
  const input = unstable_createElement('input', {
    type: 'date',
    max: toInputValue(new Date()),
    value: toInputValue(value ?? new Date()),
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      if (!v) return;
      const picked = new Date(`${v}T12:00:00`);
      if (!Number.isNaN(picked.getTime()) && picked.getTime() <= Date.now()) onPick(picked);
    },
    style: {
      fontSize: 15,
      padding: '8px 12px',
      borderRadius: 12,
      border: `2px solid ${palette.line}`,
      color: palette.ink,
      backgroundColor: palette.card,
      fontFamily: 'inherit',
    },
  });
  return (
    <View style={styles.row}>
      {input}
      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={styles.done}>done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  done: { color: palette.accent, fontWeight: '800', fontSize: 13 },
});
