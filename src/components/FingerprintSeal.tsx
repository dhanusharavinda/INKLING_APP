import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, Vibration, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import PressHold from './PressHold';

// A promise you can feel: hold a thumb on the print and the ink fills in as a
// ring closes around it. Letting go early lets it fade back out, so sealing
// anything (the pact, retiring a promise, unlinking) is always deliberate.

const DEFAULT_HOLD_MS = 5000;
const VIEWBOX = 120;

// A stylized thumbprint: nested ridge arcs plus a little core.
const PRINT_PATHS = [
  'M 34 86 C 29 62, 34 38, 60 36 C 86 38, 91 62, 86 86',
  'M 40 88 C 36 64, 40 45, 60 43 C 80 45, 84 64, 80 88',
  'M 46 90 C 42 67, 46 52, 60 50 C 74 52, 78 67, 74 90',
  'M 52 90 C 49 71, 51 58, 60 57 C 69 58, 71 71, 68 90',
  'M 60 66 C 64 68, 65 76, 61 82 C 57 79, 56 70, 60 66',
];

export interface FingerprintSealProps {
  onComplete: () => void;
  busy?: boolean;
  done?: boolean; // already sealed: the print stays fully inked
  holdMs?: number;
  size?: number;
  tone?: 'dark' | 'light';
  accent?: string;
  idleLabel?: string;
  doneLabel?: string;
  busyLabel?: string;
  releaseHint?: string;
}

function stageLine(progress: number, idleLabel: string): string {
  if (progress <= 0) return idleLabel;
  if (progress < 0.25) return 'pressing ♡';
  if (progress < 0.5) return 'keep holding…';
  if (progress < 0.75) return 'almost there…';
  return 'sealing it…';
}

export default function FingerprintSeal({
  onComplete,
  busy = false,
  done = false,
  holdMs = DEFAULT_HOLD_MS,
  size = 168,
  tone = 'dark',
  accent = '#F2789F',
  idleLabel = 'press & hold for 5 seconds',
  doneLabel = 'sealed ♡',
  busyLabel = 'inking it in…',
  releaseHint = 'hold it like you hold them: all 5 seconds ♡',
}: FingerprintSealProps) {
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const holding = useRef(false);
  const startAt = useRef(0);
  const raf = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastSet = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  useEffect(
    () => () => {
      holding.current = false;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );

  // a failed attempt hands the thumb another chance
  useEffect(() => {
    if (!busy && !done && fired.current) {
      fired.current = false;
      lastSet.current = 0;
      setProgress(0);
    }
  }, [busy, done]);

  const tick = () => {
    if (!holding.current) return;
    const p = Math.min(1, (Date.now() - startAt.current) / holdMs);
    if (p - lastSet.current >= 0.02 || p >= 1) {
      lastSet.current = p;
      setProgress(p);
    }
    if (p >= 1) {
      holding.current = false;
      if (!fired.current) {
        fired.current = true;
        try {
          Vibration.vibrate([0, 60, 50, 140]);
        } catch {
          // haptics are a bonus, never a requirement
        }
        onComplete();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (busy || done || fired.current) return;
    holding.current = true;
    startAt.current = Date.now();
    lastSet.current = 0;
    setHint(null);
    try {
      Vibration.vibrate(15);
    } catch {
      // ignore
    }
    tick();
  };

  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const held = (Date.now() - startAt.current) / holdMs;
    lastSet.current = 0;
    setProgress(0);
    if (held > 0.12) {
      setHint(releaseHint);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 2600);
    }
  };

  const p = done ? 1 : progress;
  const inkOpacity = done ? 1 : 0.18 + 0.82 * p;
  const ridge = tone === 'dark' ? '#6B5A76' : '#C9BBD4';
  const stageColor = tone === 'dark' ? '#F6EDF2' : '#3A3340';
  const ringR = 54;
  const ringC = 2 * Math.PI * ringR;

  return (
    <View style={styles.wrap}>
      <PressHold onStart={start} onEnd={stop} disabled={busy || done} style={styles.press}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
            {/* soft glow that warms up while holding */}
            <Circle cx={60} cy={60} r={48} fill={accent} opacity={0.06 + 0.2 * p} />
            <Circle cx={60} cy={60} r={ringR} stroke={ridge} strokeWidth={3} fill="none" opacity={0.5} />
            <Circle
              cx={60}
              cy={60}
              r={ringR}
              stroke={accent}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${ringC}`}
              strokeDashoffset={ringC * (1 - p)}
              transform="rotate(-90 60 60)"
            />
            {PRINT_PATHS.map((d, i) => (
              <Path
                key={`b${i}`}
                d={d}
                stroke={ridge}
                strokeWidth={3.4}
                strokeLinecap="round"
                fill="none"
                opacity={0.55}
              />
            ))}
            {PRINT_PATHS.map((d, i) => (
              <Path
                key={`p${i}`}
                d={d}
                stroke={accent}
                strokeWidth={3.4}
                strokeLinecap="round"
                fill="none"
                opacity={inkOpacity}
              />
            ))}
          </Svg>
          {busy && (
            <View style={styles.busy}>
              <ActivityIndicator color={accent} />
            </View>
          )}
        </View>
      </PressHold>
      <Text style={[styles.stage, { color: stageColor }]}>
        {busy ? busyLabel : done ? doneLabel : stageLine(p, idleLabel)}
      </Text>
      {hint && <Text style={[styles.hint, { color: accent }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  press: { alignItems: 'center', justifyContent: 'center' },
  busy: { position: 'absolute' },
  stage: { fontSize: 13.5, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
});
