import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';

interface Drop {
  key: string;
  x: number; // 0..1 across the width
  size: number;
  delay: number;
  anim: Animated.Value;
}

interface Props {
  emoji: string | null; // set to an emoji to rain it once; parent clears via key
  burstKey: number; // bump to retrigger
}

const DROPS = 14;
const FALL_MS = 2400;

// A soft one-shot rain of little emojis over whatever it is layered on.
// A burst arriving mid-rain simply replaces the current one, so a partner's
// reaction is never silently dropped.
export default function EmojiRain({ emoji, burstKey }: Props) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const latestKey = useRef(0);

  useEffect(() => {
    if (!emoji || burstKey === 0) return;
    latestKey.current = burstKey;
    const next: Drop[] = Array.from({ length: DROPS }, (_, i) => ({
      key: `${burstKey}-${i}`,
      x: (i + 0.5) / DROPS + (((i * 37) % 10) - 5) / 60,
      size: 16 + ((i * 53) % 12),
      delay: ((i * 97) % DROPS) * 90,
      anim: new Animated.Value(0),
    }));
    setDrops(next);
    const anims = next.map((d) =>
      Animated.timing(d.anim, {
        toValue: 1,
        duration: FALL_MS,
        delay: d.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    Animated.parallel(anims).start(() => {
      // only the burst that is still current may clear the stage
      if (latestKey.current === burstKey) setDrops([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);

  if (drops.length === 0 || !emoji) return null;

  return (
    <Animated.View style={styles.layer} pointerEvents="none">
      {drops.map((d) => (
        <Animated.Text
          key={d.key}
          style={{
            position: 'absolute',
            left: `${Math.max(2, Math.min(92, d.x * 100))}%`,
            fontSize: d.size,
            opacity: d.anim.interpolate({
              inputRange: [0, 0.15, 0.75, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: d.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-30, 320],
                }),
              },
              {
                rotate: d.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', d.key.endsWith('1') ? '30deg' : '-24deg'],
                }),
              },
            ],
          }}
        >
          {emoji}
        </Animated.Text>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 10,
  },
});
