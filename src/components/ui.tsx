import React, { useRef } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { palette, radius, cardShadow, serif, shadeHex } from '../theme';

// A yes/no confirm that works the same on native (Alert) and web (confirm).
export function confirmAsk(title: string, message: string, onYes: () => void, yesLabel = 'Yes') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}

// Duolingo-style chunky button: a colored cap sitting on a darker base that
// compresses when pressed.
export function Button({
  label,
  onPress,
  color = palette.accent,
  textColor = '#FFFFFF',
  disabled = false,
  kind = 'solid',
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  disabled?: boolean;
  kind?: 'solid' | 'soft' | 'ghost';
  style?: ViewStyle;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) =>
    Animated.timing(press, { toValue: v, duration: 90, useNativeDriver: true }).start();
  const translateY = press.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });

  const isSolid = kind === 'solid';
  const isGhost = kind === 'ghost';
  const capColor = isSolid ? color : isGhost ? 'transparent' : palette.accentSoft;
  const baseColor = isSolid ? shadeHex(color, 0.28) : 'transparent';
  const label2 = isSolid ? textColor : color;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      disabled={disabled}
      style={[{ borderRadius: 18, backgroundColor: baseColor, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Animated.View
        style={[
          styles.btnCap,
          {
            backgroundColor: capColor,
            transform: [{ translateY }],
            borderWidth: isGhost ? 1.5 : 0,
            borderColor: palette.line,
          },
        ]}
      >
        <Text style={[styles.btnText, { color: label2 }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

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
  btnCap: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
});
