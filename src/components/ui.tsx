import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { palette, radius, cardShadow, serif } from '../theme';

export function Card({
  children,
  style,
  tint,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tint?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        cardShadow as ViewStyle,
        tint ? { backgroundColor: tint } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function Chip({
  label,
  color,
  textColor,
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: color ?? palette.accentSoft }]}>
      <Text style={[styles.chipText, { color: textColor ?? palette.accent }]}>{label}</Text>
    </View>
  );
}

export function Quote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.quote}>“{children}”</Text>;
}

export function ProgressBar({
  progress,
  color,
  height = 8,
}: {
  progress: number; // 0..1
  color?: string;
  height?: number;
}) {
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color ?? palette.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.card,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: palette.inkSoft,
    marginBottom: 10,
    marginTop: 24,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.chip,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quote: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 27,
    color: palette.ink,
  },
  progressTrack: {
    backgroundColor: palette.line,
    overflow: 'hidden',
    width: '100%',
  },
});
