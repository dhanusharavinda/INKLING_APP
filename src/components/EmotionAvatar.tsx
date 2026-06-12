import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { EmotionKey } from '../types';
import { emotionMeta } from '../emotions';

interface Props {
  emotion: EmotionKey;
  size?: number;
  animated?: boolean;
}

// Cute Inside Out-style blob character, drawn entirely with Views.
export default function EmotionAvatar({ emotion, size = 72, animated = false }: Props) {
  const meta = emotionMeta(emotion);
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, float]);

  const s = size;
  const eye = s * 0.16;
  const pupil = eye * 0.55;
  const translateY = animated
    ? float.interpolate({ inputRange: [0, 1], outputRange: [0, -s * 0.05] })
    : 0;

  const browBase = {
    position: 'absolute' as const,
    width: s * 0.18,
    height: Math.max(2, s * 0.035),
    borderRadius: 99,
    backgroundColor: meta.deep,
    top: s * 0.27,
  };

  return (
    <Animated.View
      style={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY }],
      }}
    >
      {/* blob body: asymmetric radii make it look hand-drawn */}
      <View
        style={{
          width: s * 0.94,
          height: s * 0.88,
          backgroundColor: meta.color,
          borderTopLeftRadius: s * 0.5,
          borderTopRightRadius: s * 0.46,
          borderBottomLeftRadius: s * 0.42,
          borderBottomRightRadius: s * 0.5,
        }}
      />
      {/* eyes */}
      <View style={[styles.eyeRow, { top: s * 0.33, paddingHorizontal: s * 0.2, width: s }]}>
        <View style={[styles.eye, { width: eye, height: eye, borderRadius: eye }]}>
          <View
            style={{
              width: pupil,
              height: pupil,
              borderRadius: pupil,
              backgroundColor: '#2D2433',
            }}
          />
        </View>
        <View style={[styles.eye, { width: eye, height: eye, borderRadius: eye }]}>
          <View
            style={{
              width: pupil,
              height: pupil,
              borderRadius: pupil,
              backgroundColor: '#2D2433',
            }}
          />
        </View>
      </View>
      {/* brows */}
      {meta.brows === 'angry' && (
        <>
          <View style={[browBase, { left: s * 0.2, transform: [{ rotate: '18deg' }] }]} />
          <View style={[browBase, { right: s * 0.2, transform: [{ rotate: '-18deg' }] }]} />
        </>
      )}
      {meta.brows === 'sad' && (
        <>
          <View style={[browBase, { left: s * 0.2, transform: [{ rotate: '-14deg' }] }]} />
          <View style={[browBase, { right: s * 0.2, transform: [{ rotate: '14deg' }] }]} />
        </>
      )}
      {meta.brows === 'raised' && (
        <>
          <View style={[browBase, { left: s * 0.2, top: s * 0.24 }]} />
          <View style={[browBase, { right: s * 0.2, top: s * 0.24 }]} />
        </>
      )}
      {/* blush */}
      {meta.blush && (
        <>
          <View style={[styles.blush, { width: s * 0.13, height: s * 0.08, left: s * 0.13, top: s * 0.52 }]} />
          <View style={[styles.blush, { width: s * 0.13, height: s * 0.08, right: s * 0.13, top: s * 0.52 }]} />
        </>
      )}
      {/* mouth */}
      <View style={{ position: 'absolute', top: s * 0.55, alignItems: 'center', width: s }}>
        {meta.mouth === 'grin' && (
          <View
            style={{
              width: s * 0.34,
              height: s * 0.18,
              backgroundColor: meta.deep,
              borderBottomLeftRadius: s * 0.2,
              borderBottomRightRadius: s * 0.2,
            }}
          />
        )}
        {meta.mouth === 'smile' && (
          <View
            style={{
              width: s * 0.26,
              height: s * 0.12,
              borderBottomWidth: Math.max(2, s * 0.04),
              borderBottomColor: meta.deep,
              borderBottomLeftRadius: s * 0.13,
              borderBottomRightRadius: s * 0.13,
            }}
          />
        )}
        {meta.mouth === 'frown' && (
          <View
            style={{
              width: s * 0.26,
              height: s * 0.12,
              marginTop: s * 0.04,
              borderTopWidth: Math.max(2, s * 0.04),
              borderTopColor: meta.deep,
              borderTopLeftRadius: s * 0.13,
              borderTopRightRadius: s * 0.13,
            }}
          />
        )}
        {meta.mouth === 'open' && (
          <View
            style={{
              width: s * 0.16,
              height: s * 0.2,
              borderRadius: s * 0.1,
              backgroundColor: meta.deep,
            }}
          />
        )}
        {meta.mouth === 'flat' && (
          <View
            style={{
              width: s * 0.24,
              height: Math.max(2, s * 0.045),
              borderRadius: 99,
              backgroundColor: meta.deep,
              marginTop: s * 0.05,
            }}
          />
        )}
        {meta.mouth === 'wavy' && (
          <View style={{ flexDirection: 'row', marginTop: s * 0.04 }}>
            <View
              style={{
                width: s * 0.13,
                height: s * 0.08,
                borderBottomWidth: Math.max(2, s * 0.035),
                borderBottomColor: meta.deep,
                borderBottomLeftRadius: s * 0.08,
                borderBottomRightRadius: s * 0.08,
              }}
            />
            <View
              style={{
                width: s * 0.13,
                height: s * 0.08,
                borderTopWidth: Math.max(2, s * 0.035),
                borderTopColor: meta.deep,
                borderTopLeftRadius: s * 0.08,
                borderTopRightRadius: s * 0.08,
              }}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  eyeRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eye: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blush: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: 'rgba(255, 120, 120, 0.35)',
  },
});
