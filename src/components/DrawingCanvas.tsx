import React, { useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { CanvasItem, CanvasText, Stroke } from '../types';
import { CANVAS_BG, DRAW_SPACE, strokeToPath } from '../drawing';
import { palette, serif } from '../theme';

// Cute pastel pens for the shared doodle board.
const PENS = [
  '#E76B8D', // rose
  '#F2994A', // tangerine
  '#F5C541', // sunshine
  '#6FCF97', // mint
  '#4FA8E8', // sky
  '#9B7EDE', // lilac
  '#8B5E4A', // cocoa
  '#3A3340', // ink
];
const WIDTHS = [2.5, 5, 9];
const TEXT_SIZES = [7, 11, 16];
const ERASER_SCALE = 2.4; // the eraser is a chunky background-colored pen

type Draft = Omit<CanvasText, 'id' | 'author'>;

interface Props {
  items: CanvasItem[]; // everything on the shared board (both people)
  onStroke: (s: Stroke) => void; // a finished line of mine
  onText: (t: Draft) => void; // a placed text/emoji sticker of mine
  onFill: (color: string) => void; // paint-bucket: flood the page with a color
  onUndo: () => void; // remove my latest item
  onClear: () => void; // wipe the board (parent confirms)
  canUndo: boolean;
  canClear: boolean;
  disabled?: boolean;
}

export default function DrawingCanvas({
  items,
  onStroke,
  onText,
  onFill,
  onUndo,
  onClear,
  canUndo,
  canClear,
  disabled = false,
}: Props) {
  const [size, setSize] = useState(280);
  const [pen, setPen] = useState(PENS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const [live, setLive] = useState<Stroke | null>(null);

  // text stickers: composed in a modal (keyboard-safe), then dragged into
  // place; a two-finger pinch on the canvas resizes the draft before sticking
  const [composerOpen, setComposerOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textSize, setTextSize] = useState(TEXT_SIZES[1]);
  const [textColor, setTextColor] = useState(PENS[0]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const pinchRef = useRef<{ d0: number; size0: number } | null>(null);
  // once a gesture has pinched, single-finger moves are ignored until release,
  // so lifting one finger cannot yank the sticker across the page
  const pinchedRef = useRef(false);

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const penRef = useRef(pen);
  penRef.current = pen;
  const widthRef = useRef(width);
  widthRef.current = width;
  const eraserRef = useRef(eraser);
  eraserRef.current = eraser;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const liveRef = useRef<Stroke | null>(null);
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const originRef = useRef({ x: 0, y: 0 });

  // Self-calibrating coordinates: at the moment a touch starts, locationX/Y is
  // exact, so pageXY minus locationXY IS the canvas origin in the same
  // coordinate space as every later pageXY. This kills both the edge glitch
  // (stale locationX during moves) and the fixed offset that measureInWindow
  // produced on devices where pageY includes the status bar.
  const toSpace = (pageX: number, pageY: number) => ({
    x: Math.max(0, Math.min(DRAW_SPACE, ((pageX - originRef.current.x) / sizeRef.current) * DRAW_SPACE)),
    y: Math.max(0, Math.min(DRAW_SPACE, ((pageY - originRef.current.y) / sizeRef.current) * DRAW_SPACE)),
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (evt) => {
        pinchRef.current = null;
        pinchedRef.current = false;
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        originRef.current = { x: pageX - locationX, y: pageY - locationY };
        const p = toSpace(pageX, pageY);
        if (draftRef.current) {
          setDraft((d) => (d ? { ...d, x: p.x, y: p.y } : d));
          return;
        }
        const s: Stroke = {
          color: eraserRef.current ? CANVAS_BG : penRef.current,
          width: eraserRef.current ? widthRef.current * ERASER_SCALE : widthRef.current,
          points: [p.x, p.y],
        };
        liveRef.current = s;
        setLive(s);
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches ?? [];
        // two fingers on a draft sticker: pinch to resize it
        if (draftRef.current && touches.length >= 2) {
          pinchedRef.current = true;
          const [t1, t2] = touches;
          const d = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
          if (!pinchRef.current) {
            pinchRef.current = { d0: d, size0: draftRef.current.size };
          } else {
            const p = pinchRef.current;
            const size = Math.max(4, Math.min(40, (p.size0 * d) / p.d0));
            setDraft((cur) => (cur ? { ...cur, size } : cur));
          }
          return;
        }
        pinchRef.current = null;
        if (pinchedRef.current) return; // pinch ended; wait for a fresh touch
        const { pageX, pageY } = evt.nativeEvent;
        const p = toSpace(pageX, pageY);
        if (draftRef.current) {
          setDraft((d) => (d ? { ...d, x: p.x, y: p.y } : d));
          return;
        }
        const cur = liveRef.current;
        if (!cur) return;
        const next: Stroke = { ...cur, points: [...cur.points, p.x, p.y] };
        liveRef.current = next;
        setLive(next);
      },
      onPanResponderRelease: () => {
        pinchRef.current = null;
        const done = liveRef.current;
        liveRef.current = null;
        setLive(null);
        if (done && done.points.length >= 2) onStrokeRef.current(done);
      },
      onPanResponderTerminate: () => {
        pinchRef.current = null;
        liveRef.current = null;
        setLive(null);
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const placeDraft = () => {
    const t = textInput.trim();
    if (!t) return;
    setDraft({ kind: 'text', text: t.slice(0, 60), x: 50, y: 50, size: textSize, color: textColor });
    setComposerOpen(false);
  };
  const commitDraft = () => {
    if (!draft) return;
    onText(draft);
    setDraft(null);
    setTextInput('');
  };

  const rendered: CanvasItem[] = live
    ? [...items, { ...live, kind: 'stroke', id: '·live', author: '' }]
    : items;

  return (
    <View>
      <View
        collapsable={false}
        style={styles.canvas}
        onLayout={(e) => setSize(Math.round(e.nativeEvent.layout.width))}
        {...pan.panHandlers}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${DRAW_SPACE} ${DRAW_SPACE}`}>
          <Rect width={DRAW_SPACE} height={DRAW_SPACE} fill={CANVAS_BG} rx={4} />
          {rendered.map((it, i) =>
            it.kind === 'fill' ? (
              <Rect key={it.id || i} width={DRAW_SPACE} height={DRAW_SPACE} fill={it.color} rx={4} />
            ) : it.kind === 'text' ? (
              <SvgText
                key={it.id || i}
                x={it.x}
                y={it.y}
                fontSize={it.size}
                fill={it.color}
                fontFamily={serif}
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="central"
              >
                {it.text}
              </SvgText>
            ) : (
              <Path
                key={it.id || i}
                d={strokeToPath(it)}
                stroke={it.color}
                strokeWidth={it.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          )}
          {draft && (
            <SvgText
              x={draft.x}
              y={draft.y}
              fontSize={draft.size}
              fill={draft.color}
              fontFamily={serif}
              fontWeight="600"
              opacity={0.85}
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {draft.text}
            </SvgText>
          )}
        </Svg>
        {rendered.length === 0 && !draft && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hint}>your shared page, doodle together ♡</Text>
          </View>
        )}
        {draft && (
          <View style={styles.draftBanner} pointerEvents="none">
            <Text style={styles.draftBannerText}>drag to move · pinch to resize ♡</Text>
          </View>
        )}
      </View>

      {/* draft actions float right under the canvas, impossible to miss */}
      {draft && (
        <View style={styles.draftActions}>
          <Pressable onPress={commitDraft} style={styles.stickBtn}>
            <Text style={styles.stickBtnText}>✓ stick it</Text>
          </Pressable>
          <Pressable onPress={() => setDraft(null)} style={styles.cancelDraftBtn} hitSlop={6}>
            <Text style={styles.cancelDraftText}>✕ cancel</Text>
          </Pressable>
        </View>
      )}

      {/* pens + eraser + text sticker */}
      <View style={styles.toolsRow}>
        {PENS.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              setPen(c);
              setEraser(false);
            }}
            style={[styles.pen, { backgroundColor: c }, pen === c && !eraser && styles.penActive]}
          />
        ))}
        <Pressable
          onPress={() => setEraser((v) => !v)}
          style={[styles.toolBtn, eraser && styles.toolBtnActive]}
          hitSlop={4}
        >
          <Text style={{ fontSize: 13 }}>🧼</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setEraser(false);
            setComposerOpen(true);
          }}
          style={styles.toolBtn}
          hitSlop={4}
        >
          <Text style={{ fontSize: 12, fontWeight: '900', color: palette.ink }}>T😊</Text>
        </Pressable>
        <Pressable
          onPress={() => onFill(eraser ? CANVAS_BG : pen)}
          style={styles.toolBtn}
          hitSlop={4}
        >
          <Text style={{ fontSize: 13 }}>🪣</Text>
        </Pressable>
      </View>

      {/* widths + actions */}
      <View style={styles.actionsRow}>
        {WIDTHS.map((w) => (
          <Pressable
            key={w}
            onPress={() => setWidth(w)}
            style={[styles.widthBtn, width === w && styles.toolBtnActive]}
          >
            <View
              style={{
                width: 4 + w * 1.6,
                height: 4 + w * 1.6,
                borderRadius: 99,
                backgroundColor: palette.ink,
              }}
            />
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onUndo} disabled={!canUndo} hitSlop={6}>
          <Text style={[styles.action, !canUndo && { opacity: 0.35 }]}>↩ undo mine</Text>
        </Pressable>
        <Pressable onPress={onClear} disabled={!canClear} hitSlop={6} style={{ marginLeft: 16 }}>
          <Text style={[styles.action, !canClear && { opacity: 0.35 }]}>✕ clear</Text>
        </Pressable>
      </View>

      {/* keyboard-safe sticker composer */}
      <Modal
        visible={composerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setComposerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add a little something ♡</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="text or emoji, e.g. 🐥 hi"
              placeholderTextColor={palette.inkFaint}
              value={textInput}
              onChangeText={setTextInput}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>size</Text>
              {TEXT_SIZES.map((s, i) => (
                <Pressable
                  key={s}
                  onPress={() => setTextSize(s)}
                  style={[styles.sizeBtn, textSize === s && styles.toolBtnActive]}
                >
                  <Text style={{ fontSize: 11 + i * 3, fontWeight: '800', color: palette.ink }}>
                    A
                  </Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Text style={styles.modalLabel}>pinch on page to fine-tune</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>color</Text>
              {PENS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setTextColor(c)}
                  style={[
                    styles.pen,
                    { backgroundColor: c },
                    textColor === c && styles.penActive,
                  ]}
                />
              ))}
            </View>
            <Pressable
              onPress={placeDraft}
              style={[styles.placeBtn, !textInput.trim() && { opacity: 0.4 }]}
              disabled={!textInput.trim()}
            >
              <Text style={styles.placeBtnText}>place on the page</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F6DCE5',
    // web: fingers must draw, not scroll the page (crucial on iPhone Safari)
    ...(Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'crosshair' } as object) : null),
  },
  hintWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: palette.inkFaint, fontStyle: 'italic', fontSize: 13 },
  draftBanner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(58,51,64,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  draftBannerText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
  stickBtn: {
    backgroundColor: '#F2789F',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  stickBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cancelDraftBtn: {
    backgroundColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  cancelDraftText: { color: palette.inkSoft, fontWeight: '800', fontSize: 13 },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  pen: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'transparent' },
  penActive: { borderColor: palette.ink, transform: [{ scale: 1.15 }] },
  toolBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  toolBtnActive: { backgroundColor: '#F6DCE5', borderWidth: 2, borderColor: palette.ink },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  widthBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  action: { fontSize: 13, fontWeight: '700', color: palette.accent },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,36,51,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 90,
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginBottom: 12 },
  modalInput: {
    backgroundColor: palette.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.ink,
  },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  sizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.line,
  },
  placeBtn: {
    backgroundColor: '#F2789F',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  placeBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
