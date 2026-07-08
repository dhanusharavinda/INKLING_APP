import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

// Native date picker (Android/iOS). The web build resolves
// DatePickerField.web.tsx instead, so this module never reaches browsers.
export interface DatePickerFieldProps {
  visible: boolean;
  value: Date | null;
  onPick: (d: Date) => void;
  onClose: () => void;
}

export default function DatePickerField({ visible, value, onPick, onClose }: DatePickerFieldProps) {
  if (!visible) return null;
  return (
    <DateTimePicker
      value={value ?? new Date()}
      mode="date"
      maximumDate={new Date()}
      onChange={(event, date) => {
        if (event.type === 'set' && date) {
          onPick(date);
          if (Platform.OS !== 'ios') onClose();
        } else if (event.type === 'dismissed') {
          onClose();
        }
      }}
    />
  );
}
