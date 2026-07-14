import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import {
  CanvasItem,
  CanvasText,
  HangmanState,
  LoveNote,
  PairEvent,
  PairGameState,
  PairInfo,
  PairSnap,
  RpsState,
  Stroke,
  XoState,
} from '../types';
import { palette, serif, radius } from '../theme';
import {
  addCanvasItem,
  cancelUnlink,
  clearCanvas,
  createPair,
  deleteCanvasStroke,
  deleteLoveNote,
  fetchCanvas,
  fetchLatestEvent,
  fetchLatestMoods,
  fetchLoveNotes,
  fetchMyPair,
  fetchPairGame,
  fetchXo,
  friendlyCloudError,
  gameTap,
  joinPair,
  onCanvasChange,
  onGameChange,
  onLoveNotesChange,
  deleteSnap,
  fetchHangman,
  fetchRps,
  fetchSnaps,
  hangmanGuess,
  hangmanStart,
  onHangmanChange,
  onPairEvent,
  onRpsChange,
  onXoChange,
  reactToLoveNote,
  requestUnlink,
  rpsPlay,
  saveSnap,
  sendLoveNote,
  sendPairEvent,
  xoMove,
  xoReset,
} from '../cloud';
import { itemsToSvg } from '../drawing';
import { vanGoghify } from '../aiArt';
import {
  ANSWER_REACTIONS,
  coupleStatusLine,
  moodMeta,
  PAIR_MOODS,
  reactionMeta,
  reactionsForMood,
} from '../pairMoods';
import { makeId } from '../storage';
import {
  birdImageFor,
  effectiveStreak,
  GAME_GOAL,
  GAME_PERSONAL_CAP,
  goalReachedToday,
  myTapsToday,
  optimisticTaps,
  stagePhrase,
  tapsToday,
  utcDayKey,
} from '../gameScene';
import { ensureStreakReminder } from '../notifications';
import {
  buildDoodleData,
  buildGameData,
  refreshDoodleWidget,
  refreshGameWidget,
} from '../widget/widgetSync';
import EmotionAvatar from '../components/EmotionAvatar';
import DrawingCanvas from '../components/DrawingCanvas';
import EmojiRain from '../components/EmojiRain';
import { Button, Card, ProgressBar } from '../components/ui';

interface Props {
  userId: string;
  myName: string;
  apiKey: string;
  cloudEnabled: boolean;
}

type SubTab = 'doodle' | 'together' | 'quest' | 'games' | 'mem';
type GameTab = 'xo' | 'hang' | 'rps';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const RPS_META: { key: 'rock' | 'paper' | 'scissors'; emoji: string }[] = [
  { key: 'rock', emoji: '🪨' },
  { key: 'paper', emoji: '📄' },
  { key: 'scissors', emoji: '✂️' },
];
const rpsEmoji = (k: string) => RPS_META.find((r) => r.key === k)?.emoji ?? '❔';

function confirmAsk(title: string, message: string, onYes: () => void, yesLabel = 'Yes') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}

export default function UsScreen({ userId, myName, apiKey, cloudEnabled }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<CanvasItem[]>([]);
  const [moods, setMoods] = useState<PairEvent[]>([]);
  const [game, setGame] = useState<PairGameState | null>(null);
  const [xo, setXo] = useState<XoState | null>(null);
  const [hangman, setHangman] = useState<HangmanState | null>(null);
  const [rps, setRps] = useState<RpsState | null>(null);
  const [notes, setNotes] = useState<LoveNote[]>([]);
  const [lastReaction, setLastReaction] = useState<PairEvent | null>(null);
  const [lastLink, setLastLink] = useState<PairEvent | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('doodle');
  const [gameTab, setGameTab] = useState<GameTab>('xo');

  // doodle extras: expand, AI art, snap, redo
  const [expandOpen, setExpandOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [artView, setArtView] = useState(false); // painting shown on the doodle card
  const aiViewRef = useRef<View>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapHint, setSnapHint] = useState<string | null>(null);
  const snapHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [redoStack, setRedoStack] = useState<CanvasItem[]>([]);

  // memories calendar
  const [memMonth, setMemMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  });
  const [snaps, setSnaps] = useState<PairSnap[]>([]);
  const [memDay, setMemDay] = useState<string | null>(null);

  // hangman input
  const [plantWord, setPlantWord] = useState('');
  const [gameBusy, setGameBusy] = useState(false);

  // emoji rain trigger
  const [rain, setRain] = useState<{ emoji: string; key: number }>({ emoji: '', key: 0 });
  const pour = useCallback((emoji: string) => setRain((r) => ({ emoji, key: r.key + 1 })), []);

  // pairing UI
  const [joinCode, setJoinCode] = useState('');
  const [pairBusy, setPairBusy] = useState(false);

  // link sharing + question composer
  const [linkModal, setLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
  const [xoBusy, setXoBusy] = useState(false);

  const paired = !!pair && !!pair.userB;
  const iAmA = !!pair && pair.userA === userId;
  const partnerName = useMemo(() => {
    if (!pair) return '';
    const n = pair.userA === userId ? pair.nameB : pair.nameA;
    return n.trim() || 'your person';
  }, [pair, userId]);

  const load = useCallback(async () => {
    if (!cloudEnabled) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const p = await fetchMyPair();
      setPair(p);
      if (p && p.userB) {
        const authorIds = [p.userA, p.userB].filter(Boolean) as string[];
        const amA = p.userA === userId;
        const [cs, ms, g, x, ns, lr, ll, hm, rp] = await Promise.all([
          fetchCanvas(p.id),
          fetchLatestMoods(p.id, authorIds),
          fetchPairGame(p.id),
          fetchXo(p.id),
          fetchLoveNotes(p.id),
          fetchLatestEvent(p.id, 'reaction'),
          fetchLatestEvent(p.id, 'link'),
          fetchHangman(p.id),
          fetchRps(p.id, amA),
        ]);
        setItems(cs);
        setMoods(ms);
        setGame(g);
        setXo(x);
        setNotes(ns);
        setLastReaction(lr);
        setLastLink(ll);
        setHangman(hm);
        setRps(rp);
      } else {
        setItems([]);
        setMoods([]);
        setGame(null);
        setXo(null);
        setNotes([]);
        setLastReaction(null);
        setLastLink(null);
        setHangman(null);
        setRps(null);
      }
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cloudEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  // moods as string keys, validated through the catalog
  const myMood = moods.find((m) => m.author === userId)?.value;
  const partnerMood = moods.find((m) => m.author !== userId)?.value;
  const myMoodMeta = moodMeta(myMood);
  const partnerMoodMeta = moodMeta(partnerMood);

  const statusLine = paired
    ? coupleStatusLine({
        partnerName,
        myMoodKey: myMood,
        partnerMoodKey: partnerMood,
        lastReactionKey: lastReaction?.value,
        lastReactionAt: lastReaction?.createdAt,
      })
    : null;

  // widgets always mirror committed state
  useEffect(() => {
    if (loading) return;
    refreshDoodleWidget(buildDoodleData(userId, pair, items, moods, lastReaction)).catch(() => {});
  }, [loading, userId, pair, items, moods, lastReaction]);
  useEffect(() => {
    if (loading) return;
    refreshGameWidget(buildGameData(pair, game, userId)).catch(() => {});
  }, [loading, pair, game, userId]);

  // Freshness guarantee: realtime is the instant path; this quiet poll keeps
  // both sides in step within seconds even where websockets fail, guarded so
  // it never overwrites optimistic local state mid-flight.
  const inFlightItems = useRef(0);
  const pollBusy = useRef(false);
  useEffect(() => {
    if (!pair || !pair.userB) return;
    const authorIds = [pair.userA, pair.userB].filter(Boolean) as string[];

    const tick = async () => {
      if (pollBusy.current || AppState.currentState !== 'active') return;
      pollBusy.current = true;
      try {
        const [cs, ms, g, x, ns, lr, ll, hm, rp, freshPair] = await Promise.all([
          fetchCanvas(pair.id),
          fetchLatestMoods(pair.id, authorIds),
          fetchPairGame(pair.id),
          fetchXo(pair.id),
          fetchLoveNotes(pair.id),
          fetchLatestEvent(pair.id, 'reaction'),
          fetchLatestEvent(pair.id, 'link'),
          fetchHangman(pair.id),
          fetchRps(pair.id, pair.userA === userId),
          fetchMyPair(),
        ]);
        // unlink requests (and the unlink itself) land through here
        setPair((prev) => {
          if (!prev) return prev;
          if (!freshPair || freshPair.id !== prev.id) return freshPair;
          return prev.unlinkRequestedBy === freshPair.unlinkRequestedBy &&
            prev.userB === freshPair.userB &&
            prev.nameA === freshPair.nameA &&
            prev.nameB === freshPair.nameB
            ? prev
            : freshPair;
        });
        if (inFlightItems.current === 0) {
          setItems((prev) =>
            prev.length === cs.length &&
            (prev.length === 0 || prev[prev.length - 1].id === cs[cs.length - 1].id)
              ? prev
              : cs
          );
        }
        setMoods((prev) => {
          const key = (list: PairEvent[]) =>
            list.map((m) => `${m.author}:${m.value}`).sort().join('|');
          return key(prev) === key(ms) ? prev : ms;
        });
        if (pendingTaps.current === 0 && !flushing.current && g) {
          setGame((prev) =>
            prev &&
            prev.taps === g.taps &&
            prev.day === g.day &&
            prev.streak === g.streak &&
            prev.lastStreakDay === g.lastStreakDay
              ? prev
              : g
          );
        }
        setXo((prev) => (prev && x && prev.updatedAt >= x.updatedAt ? prev : x));
        setHangman((prev) => (prev && hm && prev.updatedAt >= hm.updatedAt ? prev : hm));
        setRps((prev) => (prev && rp && prev.updatedAt >= rp.updatedAt ? prev : rp));
        setNotes((prev) => {
          const key = (list: LoveNote[]) =>
            list.map((n) => `${n.id}:${n.reaction}`).join('|');
          return key(prev) === key(ns) ? prev : ns;
        });
        setLastReaction((prev) => (prev && lr && prev.createdAt >= lr.createdAt ? prev : lr));
        setLastLink((prev) => (prev && ll && prev.createdAt >= ll.createdAt ? prev : ll));
      } catch {
        // offline; realtime and the next poll will catch up
      } finally {
        pollBusy.current = false;
      }
    };

    const timer = setInterval(tick, 4000);
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      appSub.remove();
    };
  }, [pair]);

  // live sync: canvas, moods/reactions/links, game, xo, answers
  useEffect(() => {
    if (!pair || !pair.userB) return;
    const offCanvas = onCanvasChange(pair.id, {
      onInsert: (s) => setItems((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s])),
      onDelete: (id) => setItems((prev) => prev.filter((x) => x.id !== id)),
    });
    const offEvents = onPairEvent(pair.id, (e) => {
      if (e.kind === 'mood') {
        setMoods((prev) => [e, ...prev.filter((m) => m.author !== e.author)]);
        if (e.author !== userId) pour(moodMeta(e.value)?.emoji ?? '💗');
      } else if (e.kind === 'reaction') {
        setLastReaction(e);
        if (e.author !== userId) pour(reactionMeta(e.value)?.emoji ?? '💗');
      } else if (e.kind === 'link') {
        setLastLink(e);
        if (e.author !== userId) pour('🎁');
      }
    });
    const offGame = onGameChange(pair.id, (g) => setGame(g));
    const offXo = onXoChange(pair.id, (x) => setXo(x));
    const offHang = onHangmanChange(pair.id, (h) => setHangman(h));
    const offRps = onRpsChange(pair.id, pair.userA === userId, (r) => setRps(r));
    const offNotes = onLoveNotesChange(pair.id, () => {
      fetchLoveNotes(pair.id)
        .then(setNotes)
        .catch(() => {});
    });
    return () => {
      offCanvas();
      offEvents();
      offGame();
      offXo();
      offHang();
      offRps();
      offNotes();
    };
  }, [pair, userId, pour]);

  // No error should sit on screen forever ("3 to 12 letters", network blips…)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ---------- pairing ----------

  async function handleCreatePair() {
    setPairBusy(true);
    setError(null);
    try {
      await createPair(myName);
      await load();
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setPairBusy(false);
    }
  }

  async function handleJoinPair() {
    if (joinCode.trim().length < 6) {
      setError('The code has 6 characters.');
      return;
    }
    setPairBusy(true);
    setError(null);
    try {
      await joinPair(joinCode, myName);
      setJoinCode('');
      await load();
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setPairBusy(false);
    }
  }

  const clearPairState = useCallback(() => {
    setPair(null);
    setItems([]);
    setMoods([]);
    setGame(null);
    setXo(null);
    setNotes([]);
    setHangman(null);
    setRps(null);
  }, []);

  // Unlinking takes both hearts: the first ask only marks a request, and the
  // pair is gone only when the other person confirms. A pending invite (no
  // partner yet) is deleted straight away.
  function handleLeave() {
    const confirming = !!pair?.unlinkRequestedBy && pair.unlinkRequestedBy !== userId;
    confirmAsk(
      confirming ? `Unlink from ${partnerName}?` : paired ? 'Ask to unlink?' : 'Cancel the invite?',
      confirming
        ? 'They asked to unlink. Confirming deletes your shared doodle and progress for both of you.'
        : paired
        ? `Nothing is deleted yet: ${partnerName} has to agree before you two are unlinked.`
        : 'Your invite code will stop working.',
      async () => {
        try {
          const outcome = await requestUnlink();
          if (outcome === 'requested') {
            const fresh = await fetchMyPair();
            setPair(fresh);
          } else {
            clearPairState();
          }
        } catch (e) {
          setError(friendlyCloudError(e));
        }
      },
      confirming ? 'Unlink' : paired ? 'Ask to unlink' : 'Cancel invite'
    );
  }

  async function handleKeepUs() {
    try {
      await cancelUnlink();
      const fresh = await fetchMyPair();
      setPair(fresh);
      pour('💗');
    } catch (e) {
      setError(friendlyCloudError(e));
    }
  }

  // ---------- canvas ----------

  async function commitItem(item: CanvasItem) {
    if (!pair) return;
    inFlightItems.current += 1;
    setItems((prev) => [...prev, item]);
    try {
      await addCanvasItem(pair.id, item);
    } catch (e) {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setError(friendlyCloudError(e));
    } finally {
      inFlightItems.current = Math.max(0, inFlightItems.current - 1);
    }
  }

  const handleStroke = (s: Stroke) => {
    setRedoStack([]);
    commitItem({ ...s, kind: 'stroke', id: makeId(), author: userId });
  };
  const handleText = (t: Omit<CanvasText, 'id' | 'author'>) => {
    setRedoStack([]);
    commitItem({ ...t, id: makeId(), author: userId });
  };
  const handleFill = (color: string) => {
    setRedoStack([]);
    commitItem({ kind: 'fill', id: makeId(), author: userId, color });
  };
  const handleShape = (points: number[], color: string) => {
    setRedoStack([]);
    commitItem({ kind: 'shape', id: makeId(), author: userId, color, points });
  };

  async function handleUndo() {
    const mine = [...items].reverse().find((s) => s.author === userId);
    if (!mine) return;
    setItems((prev) => prev.filter((x) => x.id !== mine.id));
    setRedoStack((prev) => [...prev, mine]);
    try {
      await deleteCanvasStroke(mine.id);
    } catch (e) {
      setItems((prev) => (prev.some((x) => x.id === mine.id) ? prev : [...prev, mine]));
      setRedoStack((prev) => prev.filter((x) => x.id !== mine.id));
      setError(friendlyCloudError(e));
    }
  }

  async function handleRedo() {
    const back = redoStack[redoStack.length - 1];
    if (!back) return;
    setRedoStack((prev) => prev.slice(0, -1));
    await commitItem(back);
  }

  function handleClear() {
    if (!pair) return;
    confirmAsk('Clear the whole page?', 'The doodle disappears for both of you.', async () => {
      let snapshot: CanvasItem[] = [];
      setItems((prev) => {
        snapshot = prev;
        return [];
      });
      setRedoStack([]);
      try {
        await clearCanvas(pair.id);
      } catch (e) {
        setItems(snapshot);
        setError(friendlyCloudError(e));
      }
    }, 'Clear');
  }

  // ---------- moods, reactions, links ----------

  const moodBusy = useRef(false);
  const reactBusy = useRef(false);

  async function handleMood(key: string) {
    if (!pair || moodBusy.current) return;
    moodBusy.current = true;
    const ev: PairEvent = {
      id: makeId(),
      pairId: pair.id,
      author: userId,
      kind: 'mood',
      value: key,
      createdAt: Date.now(),
    };
    setMoods((prev) => [ev, ...prev.filter((m) => m.author !== userId)]);
    pour(moodMeta(key)?.emoji ?? '💗');
    try {
      await sendPairEvent(pair.id, userId, 'mood', key, ev.id);
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setTimeout(() => {
        moodBusy.current = false;
      }, 1000);
    }
  }

  async function handleReaction(key: string, emoji: string) {
    if (!pair || reactBusy.current) return;
    reactBusy.current = true;
    const ev: PairEvent = {
      id: makeId(),
      pairId: pair.id,
      author: userId,
      kind: 'reaction',
      value: key,
      createdAt: Date.now(),
    };
    setLastReaction(ev); // "you two are hugging" shows instantly
    pour(emoji);
    try {
      await sendPairEvent(pair.id, userId, 'reaction', key, ev.id);
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setTimeout(() => {
        reactBusy.current = false;
      }, 1000);
    }
  }

  async function handleShareLink() {
    const url = linkInput.trim();
    if (!pair) return;
    if (!/^https?:\/\/\S+\.\S+/.test(url)) {
      setError('That does not look like a link. It should start with https://');
      return;
    }
    setLinkModal(false);
    setLinkInput('');
    const ev: PairEvent = {
      id: makeId(),
      pairId: pair.id,
      author: userId,
      kind: 'link',
      value: url,
      createdAt: Date.now(),
    };
    setLastLink(ev);
    pour('🎁');
    try {
      await sendPairEvent(pair.id, userId, 'link', url, ev.id);
    } catch (e) {
      setError(friendlyCloudError(e));
    }
  }

  // ---------- game ----------

  const pendingTaps = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null;
      if (flushing.current) {
        scheduleFlush();
        return;
      }
      const n = Math.min(25, pendingTaps.current);
      if (n <= 0) return;
      flushing.current = true;
      pendingTaps.current -= n;
      try {
        const g = await gameTap(n);
        setGame(pendingTaps.current > 0 ? optimisticTaps(g, pendingTaps.current, iAmA) : g);
      } catch (e) {
        pendingTaps.current += n;
        setError(friendlyCloudError(e));
      } finally {
        flushing.current = false;
        if (pendingTaps.current > 0) scheduleFlush();
      }
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmA]);

  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      const n = Math.min(25, pendingTaps.current);
      if (n > 0) {
        pendingTaps.current = 0;
        gameTap(n).catch(() => {});
      }
    };
  }, []);

  const myShare = myTapsToday(game, iAmA);
  const myCapReached = myShare >= GAME_PERSONAL_CAP;

  function handleTap() {
    if (!pair) return;
    if (game && goalReachedToday(game)) return;
    if (myCapReached) return; // your 60 is in; the rest is theirs
    setGame((g) => optimisticTaps(g, 1, iAmA));
    pendingTaps.current += 1;
    scheduleFlush();
  }

  useEffect(() => {
    if (loading) return;
    ensureStreakReminder(game, paired).catch(() => {});
  }, [loading, game, paired]);

  // ---------- XO ----------

  const mySymbol: 'X' | 'O' = iAmA ? 'X' : 'O';
  const xoGlyph = (c: string) => (c === 'X' ? '💗' : c === 'O' ? '⭐' : '');
  const [xoHint, setXoHint] = useState<string | null>(null);
  const xoHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showXoHint = (msg: string) => {
    setXoHint(msg);
    if (xoHintTimer.current) clearTimeout(xoHintTimer.current);
    xoHintTimer.current = setTimeout(() => setXoHint(null), 2500);
  };
  useEffect(() => () => {
    if (xoHintTimer.current) clearTimeout(xoHintTimer.current);
  }, []);

  async function handleXoCell(i: number) {
    if (!pair || xoBusy) return;
    const board = xo?.board ?? '.........';
    const winner = xo?.winner ?? '';
    const turn = xo?.nextTurn ?? 'X';
    const emptyBoard = board === '.........';
    // a rejected tap always says why, so it never feels broken
    if (winner) {
      showXoHint('this round is over, start a new one below ♡');
      return;
    }
    if (board[i] !== '.') {
      showXoHint('that spot is taken 😌');
      return;
    }
    // on an empty board anyone may start; after that, turns alternate
    if (!emptyBoard && turn !== mySymbol) {
      showXoHint(`patience ♡ it's ${partnerName}'s turn ${iAmA ? '⭐' : '💗'}`);
      return;
    }
    setXoBusy(true);
    try {
      const next = await xoMove(i + 1);
      setXo(next);
      if (next.winner === mySymbol) pour('🎀');
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setXoBusy(false);
    }
  }

  async function handleXoReset() {
    if (!pair) return;
    setXoBusy(true);
    try {
      await xoReset();
      const fresh = await fetchXo(pair.id);
      setXo(fresh);
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setXoBusy(false);
    }
  }

  // ---------- Daily dose of 💌: free little messages, never sealed ----------

  const today = utcDayKey();

  async function handleSendNote() {
    const text = answerInput.trim();
    if (!pair || !text || answerBusy) return;
    setAnswerBusy(true);
    const note: LoveNote = {
      id: makeId(),
      author: userId,
      text: text.slice(0, 500),
      reaction: '',
      createdAt: Date.now(),
    };
    setNotes((prev) => [note, ...prev]);
    setAnswerInput('');
    try {
      await sendLoveNote(pair.id, userId, note.text, note.id);
      pour('💌');
    } catch (e) {
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setAnswerInput(text);
      setError(friendlyCloudError(e));
    } finally {
      setAnswerBusy(false);
    }
  }

  async function handleNoteReaction(note: LoveNote, emoji: string) {
    if (!pair || note.author === userId) return;
    const next = note.reaction === emoji ? '' : emoji;
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, reaction: next } : n)));
    try {
      await reactToLoveNote(note.id, next);
    } catch (e) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, reaction: note.reaction } : n)));
      setError(friendlyCloudError(e));
    }
  }

  async function handleDeleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteLoveNote(id);
    } catch (e) {
      setError(friendlyCloudError(e));
    }
  }

  // ---------- snap: freeze this page + today's 💌 into the calendar ----------

  async function handleSnap() {
    if (!pair || snapBusy || (items.length === 0 && !aiImage)) return;
    setSnapBusy(true);
    try {
      const todaysNotes = notes.filter((n) => utcDayKey(n.createdAt) === today);
      await saveSnap(pair.id, {
        id: makeId(),
        author: userId,
        day: today,
        items,
        question: '',
        answers:
          todaysNotes.length > 0
            ? todaysNotes
                .slice(0, 12)
                .reverse()
                .map((n) => ({ author: n.author, text: n.text, reaction: n.reaction }))
            : null,
        art: aiImage,
        createdAt: Date.now(),
      });
      pour('📸');
      setSnapHint('saved to your 📆 memories ♡');
      if (snapHintTimer.current) clearTimeout(snapHintTimer.current);
      snapHintTimer.current = setTimeout(() => setSnapHint(null), 3000);
      if (memMonth.toISOString().slice(0, 7) === today.slice(0, 7)) {
        fetchSnaps(pair.id, today.slice(0, 7)).then(setSnaps).catch(() => {});
      }
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setSnapBusy(false);
    }
  }

  // ---------- memories calendar ----------

  const memPrefix = memMonth.toISOString().slice(0, 7); // YYYY-MM
  useEffect(() => {
    if (!pair || !pair.userB || subTab !== 'mem') return;
    fetchSnaps(pair.id, memPrefix)
      .then(setSnaps)
      .catch((e) => setError(friendlyCloudError(e)));
  }, [pair, subTab, memPrefix]);

  // several snaps can live on one day; the calendar shows how many
  const snapCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of snaps) map.set(s.day, (map.get(s.day) ?? 0) + 1);
    return map;
  }, [snaps]);
  const moveMemMonth = (delta: number) => {
    setMemDay(null);
    setMemMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + delta, 1)));
  };

  async function handleDeleteSnap(id: string) {
    setSnaps((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSnap(id);
    } catch (e) {
      setError(friendlyCloudError(e));
    }
  }

  // ---------- AI art (Van Gogh mode) ----------

  async function handleAiRepaint() {
    if (aiBusy) return;
    if (!apiKey.trim()) {
      setError('AI art needs your OpenAI key: add it in Settings first.');
      setAiOpen(false);
      return;
    }
    setAiBusy(true);
    try {
      const img = await vanGoghify({ apiKey: apiKey.trim(), items, viewRef: aiViewRef.current });
      setAiImage(img);
      setArtView(true); // the painting hangs on the doodle card once the modal closes
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setAiBusy(false);
    }
  }

  // ---------- trace: a temporary reference photo to draw over ----------

  async function pickTraceImage(): Promise<{ uri: string; ratio: number } | null> {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    return { uri: a.uri, ratio: a.width && a.height ? a.width / a.height : 1 };
  }

  // ---------- little streak celebrations ----------

  // null until the first game state lands, so opening the app with the goal
  // already reached does not rain confetti — only the moment you two hit 100.
  const prevReached = useRef<boolean | null>(null);
  useEffect(() => {
    if (!game) return;
    const now = goalReachedToday(game);
    if (prevReached.current !== null && now && !prevReached.current) pour('🎉');
    prevReached.current = now;
  }, [game, pour]);

  function streakCheer(streakDays: number, reachedToday: boolean): string | null {
    if (!reachedToday) return null;
    if (streakDays >= 100) return `${streakDays} days!!! certified soulmates 💯💗`;
    if (streakDays >= 50 && streakDays % 25 === 0) return `${streakDays} days, frame this love 🖼️`;
    if (streakDays === 30) return 'a WHOLE month of showing up for each other 🌙💗';
    if (streakDays === 14) return 'two weeks strong, you two 🕊️';
    if (streakDays === 7) return 'a whole week of showing up for each other 💗';
    if (streakDays === 3) return 'three days in a row 🥹 it’s becoming a thing';
    if (streakDays === 1) return 'day one of your little streak 🌱';
    return `day ${streakDays} together 🔥 the birds are proud of you`;
  }

  // ---------- hangman ----------

  async function handlePlantWord() {
    const w = plantWord.trim().toLowerCase();
    if (!pair || gameBusy || !/^[a-z]{3,12}$/.test(w)) {
      if (w) setError('One word, 3 to 12 letters, no spaces.');
      return;
    }
    setGameBusy(true);
    try {
      await hangmanStart(w);
      setPlantWord('');
      const fresh = await fetchHangman(pair.id);
      setHangman(fresh);
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setGameBusy(false);
    }
  }

  async function handleGuess(letter: string) {
    if (!pair || gameBusy) return;
    setGameBusy(true);
    try {
      await hangmanGuess(letter);
      const fresh = await fetchHangman(pair.id);
      setHangman(fresh);
      if (fresh?.status === 'won') pour('🎉');
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setGameBusy(false);
    }
  }

  // ---------- rock paper scissors ----------

  async function handleRps(choice: 'rock' | 'paper' | 'scissors') {
    if (!pair || gameBusy || rps?.myChoicePending) return;
    setGameBusy(true);
    try {
      await rpsPlay(choice);
      const fresh = await fetchRps(pair.id, iAmA);
      setRps(fresh);
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setGameBusy(false);
    }
  }

  // ---------- render ----------

  if (!cloudEnabled) {
    return (
      <View style={[styles.scroll, styles.center]}>
        <Text style={{ fontSize: 40 }}>💌</Text>
        <Text style={styles.emptyTitle}>A page for two</Text>
        <Text style={styles.emptyText}>
          Doodling together needs the cloud. Add your Supabase keys and sign in first.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.scroll, styles.center]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const taps = tapsToday(game);
  const reached = goalReachedToday(game);
  const streak = effectiveStreak(game);
  const theirShare = Math.max(0, taps - myShare);
  const yesterdayKey = utcDayKey(Date.now() - 86400000);
  const froze = game?.lastFreezeDay === yesterdayKey;
  const linkFresh = lastLink && Date.now() - lastLink.createdAt < 24 * 3600000;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={palette.accent}
          />
        }
      >
        <Text style={styles.title}>Us</Text>

        {!pair ? (
          <>
            <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 26 }}>
              <View style={styles.duoRow}>
                <EmotionAvatar emotion="calm" size={64} animated />
                <Text style={styles.duoHeart}>💌</Text>
                <EmotionAvatar emotion="joy" size={64} animated />
              </View>
              <Text style={styles.introTitle}>Link with your person</Text>
              <Text style={styles.introText}>
                One shared page to doodle on, moods that rain across each other's screens, a daily
                question you answer apart and reveal together, and two little birds you keep close.
              </Text>
              <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
                <Button
                  label={pairBusy ? '…' : '💌  Create our code'}
                  onPress={handleCreatePair}
                  color="#F2789F"
                  disabled={pairBusy}
                />
              </View>
            </Card>
            <Card style={{ marginTop: 12 }}>
              <Text style={styles.joinLabel}>Already have a code from them?</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput
                  style={[styles.input, { flex: 1, letterSpacing: 4, textAlign: 'center' }]}
                  placeholder="ABC123"
                  placeholderTextColor={palette.inkFaint}
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                  editable={!pairBusy}
                />
                <Button
                  label="Join"
                  onPress={handleJoinPair}
                  disabled={pairBusy || joinCode.trim().length < 6}
                />
              </View>
            </Card>
          </>
        ) : !pair.userB ? (
          <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 34 }}>💌</Text>
            <Text style={styles.introTitle}>Share this code</Text>
            <Text style={styles.codeText}>{pair.code}</Text>
            <Text style={styles.introText}>
              When your person enters it in their Inkling, you're linked. Pull down to refresh.
            </Text>
            <Pressable onPress={handleLeave} style={{ marginTop: 14 }} hitSlop={8}>
              <Text style={styles.leaveText}>cancel invite</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {/* header: who you are together right now */}
            <Card tint="#FDE8EF" style={{ marginTop: 14 }}>
              <View style={styles.pairHeader}>
                <View style={styles.moodBubbles}>
                  <View style={styles.moodBubble}>
                    <Text style={{ fontSize: 20 }}>{myMoodMeta?.emoji ?? '🙂'}</Text>
                  </View>
                  <Text style={styles.duoHeartSmall}>💌</Text>
                  <View style={styles.moodBubble}>
                    <Text style={{ fontSize: 20 }}>{partnerMoodMeta?.emoji ?? '🙂'}</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pairTitle}>You + {partnerName}</Text>
                  <Text style={styles.pairSub}>{statusLine ?? 'one shared little world'}</Text>
                </View>
                {!pair.unlinkRequestedBy && (
                  <Pressable onPress={handleLeave} hitSlop={8}>
                    <Text style={styles.leaveText}>unlink</Text>
                  </Pressable>
                )}
              </View>
              {!!pair.unlinkRequestedBy && (
                <View style={styles.unlinkBanner}>
                  <Text style={styles.unlinkText}>
                    {pair.unlinkRequestedBy === userId
                      ? `you asked to unlink 💔 nothing happens until ${partnerName} agrees`
                      : `${partnerName} asked to unlink 💔 it only happens if you confirm`}
                  </Text>
                  <View style={styles.unlinkBtns}>
                    <Pressable onPress={handleKeepUs} style={styles.keepUsBtn}>
                      <Text style={styles.keepUsText}>keep us ♡</Text>
                    </Pressable>
                    {pair.unlinkRequestedBy !== userId && (
                      <Pressable onPress={handleLeave} style={styles.confirmUnlinkBtn}>
                        <Text style={styles.confirmUnlinkText}>confirm unlink</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
              {linkFresh && lastLink && (
                <Pressable
                  onPress={() => Linking.openURL(lastLink.value).catch(() => {})}
                  style={styles.linkChip}
                >
                  <Text style={styles.linkChipText} numberOfLines={1}>
                    🎁 {lastLink.author === userId ? 'you' : partnerName} shared something · tap to
                    open
                  </Text>
                </Pressable>
              )}
            </Card>

            {/* moods + reactions + link */}
            <Card style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionLabel}>How are you feeling?</Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setLinkModal(true)} hitSlop={6}>
                  <Text style={styles.shareLinkBtn}>🔗 send a link</Text>
                </Pressable>
              </View>
              <View style={styles.moodRow}>
                {PAIR_MOODS.map((m) => (
                  <Pressable
                    key={m.key}
                    onPress={() => handleMood(m.key)}
                    style={[styles.moodPick, myMood === m.key && styles.moodPickActive]}
                  >
                    <Text style={{ fontSize: 19 }}>{m.emoji}</Text>
                    <Text style={styles.moodPickLabel}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              {(myMoodMeta || partnerMoodMeta) && (
                <View style={styles.moodCaption}>
                  {myMoodMeta && (
                    <Text style={styles.moodLine}>
                      {myMoodMeta.emoji} you {myMoodMeta.feels.replace('is ', 'are ').replace('feels', 'feel')}
                    </Text>
                  )}
                  {partnerMoodMeta && (
                    <Text style={styles.moodLine}>
                      {partnerMoodMeta.emoji} {partnerName} {partnerMoodMeta.feels}
                    </Text>
                  )}
                </View>
              )}
              {partnerMoodMeta ? (
                <View style={styles.reactRow}>
                  <Text style={styles.sectionLabelSmall}>
                    {partnerName} {partnerMoodMeta.feels}, send:
                  </Text>
                  <View style={styles.reactBtns}>
                    {reactionsForMood(partnerMood).map((r) => (
                      <Pressable
                        key={r.key}
                        onPress={() => handleReaction(r.key, r.emoji)}
                        style={styles.reactBtn}
                      >
                        <Text style={{ fontSize: 17 }}>{r.emoji}</Text>
                        <Text style={styles.reactLabel}>{r.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.reactRow}>
                  <Text style={styles.reactHint}>
                    when {partnerName} shares a feeling, you can send something back ♡
                  </Text>
                </View>
              )}
            </Card>

            {/* sub-tabs */}
            <View style={styles.subTabs}>
              {(
                [
                  { key: 'doodle', label: '🎨' },
                  { key: 'together', label: '🐦' },
                  { key: 'quest', label: '💌' },
                  { key: 'games', label: '🎮' },
                  { key: 'mem', label: '📆' },
                ] as { key: SubTab; label: string }[]
              ).map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setSubTab(t.key)}
                  style={[styles.subTabBtn, subTab === t.key && styles.subTabBtnActive]}
                >
                  <Text style={styles.subTabText}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {subTab === 'doodle' && (
              <Card style={{ marginTop: 10 }}>
                <View style={styles.canvasToolbar}>
                  <Pressable onPress={() => setExpandOpen(true)} style={styles.canvasToolBtn}>
                    <Text style={styles.canvasToolText}>⛶ expand</Text>
                  </Pressable>
                  <Pressable onPress={() => setAiOpen(true)} style={styles.canvasToolBtn}>
                    <Text style={styles.canvasToolText}>✨ AI art</Text>
                  </Pressable>
                  {!!aiImage && (
                    <Pressable
                      onPress={() => setArtView((v) => !v)}
                      style={[styles.canvasToolBtn, artView && styles.canvasToolBtnActive]}
                    >
                      <Text style={styles.canvasToolText}>{artView ? '✏️ sketch' : '🖼 painting'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleSnap}
                    style={[
                      styles.canvasToolBtn,
                      (snapBusy || (items.length === 0 && !aiImage)) && { opacity: 0.5 },
                    ]}
                    disabled={snapBusy || (items.length === 0 && !aiImage)}
                  >
                    <Text style={styles.canvasToolText}>{snapBusy ? '…' : '📸 snap'}</Text>
                  </Pressable>
                </View>
                {snapHint && <Text style={styles.snapHint}>{snapHint}</Text>}
                {aiImage && artView ? (
                  <>
                    <Image source={{ uri: aiImage }} style={styles.aiImage} resizeMode="cover" />
                    <Text style={styles.canvasHint}>
                      your page, repainted ✨ 📸 snap keeps BOTH the painting and the sketch · tap ✏️
                      sketch to keep drawing
                    </Text>
                  </>
                ) : (
                  <>
                    <DrawingCanvas
                      items={items}
                      onStroke={handleStroke}
                      onText={handleText}
                      onFill={handleFill}
                      onShape={handleShape}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onClear={handleClear}
                      canUndo={items.some((s) => s.author === userId)}
                      canRedo={redoStack.length > 0}
                      canClear={items.length > 0}
                      onPickTraceImage={pickTraceImage}
                    />
                    <Text style={styles.canvasHint}>
                      You both draw on this same page. 📷 traces a photo, 🪣 fills closed shapes, 📸
                      snap saves it (with today's 💌) into your memories calendar.
                    </Text>
                  </>
                )}
              </Card>
            )}

            {subTab === 'together' && (
              <Card style={{ marginTop: 10, alignItems: 'center' }}>
                <Pressable onPress={handleTap} style={styles.birdFrame}>
                  <Image
                    source={birdImageFor(taps, reached)}
                    style={styles.birdImage}
                    resizeMode="cover"
                  />
                </Pressable>
                <Text style={styles.phrase}>{stagePhrase(taps, reached)}</Text>
                <View style={styles.gameStatsRow}>
                  <Text style={styles.gameStat}>
                    {reached ? `${GAME_GOAL}/${GAME_GOAL} ✓` : `${taps}/${GAME_GOAL} today`}
                  </Text>
                  <Text style={styles.gameStat}>
                    you {myShare} · {partnerName} {theirShare}
                  </Text>
                  <Text style={styles.gameStat}>🔥 {streak}</Text>
                </View>
                <View style={{ width: '80%', marginTop: 6 }}>
                  <ProgressBar progress={taps / GAME_GOAL} color="#F2789F" height={9} />
                </View>
                {!!streakCheer(streak, reached) && (
                  <Text style={styles.cheerNote}>{streakCheer(streak, reached)}</Text>
                )}
                {froze && (
                  <Text style={styles.freezeNote}>
                    ❄️ a streak freeze covered yesterday, your {streak}-day streak is safe
                  </Text>
                )}
                <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
                  <Button
                    label={
                      reached
                        ? 'snuggled for today ♡'
                        : myCapReached
                        ? `your ${GAME_PERSONAL_CAP} are in ♡ the rest is theirs`
                        : 'tap! bring them closer'
                    }
                    onPress={handleTap}
                    color="#7FD1BE"
                    textColor={palette.ink}
                    disabled={reached || myCapReached}
                  />
                </View>
                <Text style={styles.gameHint}>
                  100 taps a day, together. Every 25 the birds hop closer; at 100 they snuggle till
                  midnight and the streak grows. And remember: it doesn't always have to be 50-50,
                  60-40 is love too ♡
                </Text>
              </Card>
            )}

            {subTab === 'quest' && (
              <Card style={{ marginTop: 10 }}>
                <Text style={styles.questKicker}>daily dose of 💌</Text>
                <Text style={styles.questQuestion}>
                  a little something for {partnerName} ♡
                </Text>
                <TextInput
                  style={styles.questInput}
                  placeholder="an affirmation, a reassurance, a tiny love letter… anything"
                  placeholderTextColor={palette.inkFaint}
                  value={answerInput}
                  onChangeText={setAnswerInput}
                  multiline
                  maxLength={500}
                  editable={!answerBusy}
                />
                <View style={{ marginTop: 10 }}>
                  <Button
                    label={answerBusy ? 'sending…' : 'send it 💌'}
                    onPress={handleSendNote}
                    color="#F2789F"
                    disabled={answerBusy || !answerInput.trim()}
                  />
                </View>
                {notes.length === 0 ? (
                  <Text style={styles.questHint}>
                    whatever you write lands on {partnerName}'s screen instantly, no sealing, no
                    waiting ♡
                  </Text>
                ) : (
                  notes.map((n) => {
                    const mine = n.author === userId;
                    return (
                      <View key={n.id} style={mine ? styles.answerCardMine : styles.answerCardTheirs}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.answerAuthor}>
                            {mine ? 'you' : partnerName} ·{' '}
                            {new Date(n.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                          <View style={{ flex: 1 }} />
                          {mine && (
                            <Pressable onPress={() => handleDeleteNote(n.id)} hitSlop={8}>
                              <Text style={styles.leaveText}>remove</Text>
                            </Pressable>
                          )}
                        </View>
                        <Text style={styles.answerText}>{n.text}</Text>
                        {mine ? (
                          !!n.reaction && (
                            <Text style={styles.noteReactionLine}>they felt it {n.reaction}</Text>
                          )
                        ) : (
                          <View style={styles.answerReactRow}>
                            {ANSWER_REACTIONS.map((emo) => (
                              <Pressable
                                key={emo}
                                onPress={() => handleNoteReaction(n, emo)}
                                style={[
                                  styles.answerReactBtn,
                                  n.reaction === emo && styles.answerReactBtnActive,
                                ]}
                              >
                                <Text style={{ fontSize: 17 }}>{emo}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </Card>
            )}

            {subTab === 'games' && (
              <View style={styles.gameSwitch}>
                {(
                  [
                    { key: 'xo', label: '💗⭐ XO' },
                    { key: 'hang', label: '🌸 hangman' },
                    { key: 'rps', label: '✂️ r·p·s' },
                  ] as { key: GameTab; label: string }[]
                ).map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => setGameTab(t.key)}
                    style={[styles.gameSwitchBtn, gameTab === t.key && styles.gameSwitchBtnActive]}
                  >
                    <Text
                      style={[
                        styles.gameSwitchText,
                        gameTab === t.key && { color: palette.ink },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {subTab === 'games' && gameTab === 'xo' && (
              <Card style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={styles.xoScore}>
                  you ({iAmA ? '💗' : '⭐'}) {iAmA ? xo?.winsA ?? 0 : xo?.winsB ?? 0} ·{' '}
                  {partnerName} ({iAmA ? '⭐' : '💗'}) {iAmA ? xo?.winsB ?? 0 : xo?.winsA ?? 0}
                </Text>
                <View style={styles.xoBoard}>
                  {Array.from({ length: 9 }).map((_, i) => {
                    const c = (xo?.board ?? '.........')[i];
                    return (
                      <Pressable
                        key={i}
                        onPress={() => handleXoCell(i)}
                        style={[styles.xoCell, c === '.' && !xo?.winner && styles.xoCellOpen]}
                      >
                        <Text style={{ fontSize: 26 }}>{xoGlyph(c)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.phrase}>
                  {xo?.winner === 'draw'
                    ? "it's a draw, rematch? 🤝"
                    : xo?.winner
                    ? xo.winner === mySymbol
                      ? 'you won! 🎀'
                      : `${partnerName} won this one 🏆`
                    : (xo?.board ?? '.........') === '.........'
                    ? 'fresh board, tap any square to start ♡'
                    : (xo?.nextTurn ?? 'X') === mySymbol
                    ? `your turn ${iAmA ? '💗' : '⭐'}`
                    : `${partnerName}'s turn…`}
                </Text>
                {xoHint && <Text style={styles.xoHint}>{xoHint}</Text>}
                {(xo?.board ?? '.........') === '.........' && !xo?.winner && (
                  <Text style={styles.gameHint}>
                    you are {mySymbol === 'X' ? '💗' : '⭐'}, {partnerName} is{' '}
                    {mySymbol === 'X' ? '⭐' : '💗'} · whoever taps first starts
                  </Text>
                )}
                {!!xo?.winner && (
                  <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
                    <Button
                      label="new round (loser starts)"
                      onPress={handleXoReset}
                      color="#7FD1BE"
                      textColor={palette.ink}
                      disabled={xoBusy}
                    />
                  </View>
                )}
              </Card>
            )}

            {subTab === 'games' && gameTab === 'hang' && (
              <Card style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={styles.xoScore}>
                  you {iAmA ? hangman?.winsA ?? 0 : hangman?.winsB ?? 0} · {partnerName}{' '}
                  {iAmA ? hangman?.winsB ?? 0 : hangman?.winsA ?? 0}
                </Text>
                {hangman?.status !== 'playing' ? (
                  <>
                    {(hangman?.status === 'won' || hangman?.status === 'lost') && (
                      <Text style={[styles.phrase, { marginTop: 8 }]}>
                        {hangman.status === 'won' ? 'guessed! 🎉' : 'the flower wilted 🍂'} the word
                        was “{hangman.word}”
                      </Text>
                    )}
                    <Text style={styles.gameHint}>
                      plant a secret word and {partnerName} has 6 petals to guess it
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 10 }}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="a secret word…"
                        placeholderTextColor={palette.inkFaint}
                        value={plantWord}
                        onChangeText={setPlantWord}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={12}
                        editable={!gameBusy}
                      />
                      <Button
                        label="plant 🌱"
                        onPress={handlePlantWord}
                        color="#7FD1BE"
                        textColor={palette.ink}
                        disabled={gameBusy || plantWord.trim().length < 3}
                      />
                    </View>
                  </>
                ) : hangman.setter === userId ? (
                  <>
                    <Text style={{ fontSize: 26, marginTop: 8 }}>
                      {'🌸'.repeat(Math.max(0, 6 - hangman.wrongs))}
                      {'🍂'.repeat(Math.min(6, hangman.wrongs))}
                    </Text>
                    <Text style={styles.hangWord}>
                      {hangman.word
                        .split('')
                        .map((c) => (hangman.guessed.includes(c) ? c : '·'))
                        .join(' ')}
                    </Text>
                    <Text style={styles.gameHint}>
                      your word is “{hangman.word}” · {partnerName} is guessing… tried:{' '}
                      {hangman.guessed.split('').join(' ') || 'nothing yet'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 26, marginTop: 8 }}>
                      {'🌸'.repeat(Math.max(0, 6 - hangman.wrongs))}
                      {'🍂'.repeat(Math.min(6, hangman.wrongs))}
                    </Text>
                    <Text style={styles.hangWord}>
                      {hangman.word
                        .split('')
                        .map((c) => (hangman.guessed.includes(c) ? c : '_'))
                        .join(' ')}
                    </Text>
                    <View style={styles.alphaGrid}>
                      {ALPHABET.map((l) => {
                        const used = hangman.guessed.includes(l);
                        return (
                          <Pressable
                            key={l}
                            onPress={() => handleGuess(l)}
                            disabled={used || gameBusy}
                            style={[styles.alphaKey, used && styles.alphaKeyUsed]}
                          >
                            <Text style={[styles.alphaKeyText, used && { color: palette.inkFaint }]}>
                              {l}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.gameHint}>
                      guess {partnerName}'s word before the flower loses its 6 petals
                    </Text>
                  </>
                )}
              </Card>
            )}

            {subTab === 'games' && gameTab === 'rps' && (
              <Card style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={styles.xoScore}>
                  you {iAmA ? rps?.winsA ?? 0 : rps?.winsB ?? 0} · {partnerName}{' '}
                  {iAmA ? rps?.winsB ?? 0 : rps?.winsA ?? 0} · draws {rps?.draws ?? 0}
                </Text>
                {!!rps?.lastResult && (
                  <Text style={[styles.phrase, { marginTop: 8 }]}>
                    {rpsEmoji(iAmA ? rps.lastA : rps.lastB)} vs{' '}
                    {rpsEmoji(iAmA ? rps.lastB : rps.lastA)} ·{' '}
                    {rps.lastResult === 'draw'
                      ? 'a draw 🤝'
                      : (rps.lastResult === 'a') === iAmA
                      ? 'you won! 🎀'
                      : `${partnerName} won 🏆`}
                  </Text>
                )}
                <Text style={styles.gameHint}>
                  {rps?.myChoicePending
                    ? `you chose in secret… waiting for ${partnerName} 🤫`
                    : rps?.theirChoicePending
                    ? `${partnerName} has chosen! your move…`
                    : 'both pick in secret, then it reveals'}
                </Text>
                <View style={styles.rpsRow}>
                  {RPS_META.map((r) => (
                    <Pressable
                      key={r.key}
                      onPress={() => handleRps(r.key)}
                      disabled={gameBusy || !!rps?.myChoicePending}
                      style={[styles.rpsBtn, rps?.myChoicePending && { opacity: 0.45 }]}
                    >
                      <Text style={{ fontSize: 30 }}>{r.emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            )}

            {subTab === 'mem' && (
              <Card style={{ marginTop: 10 }}>
                <View style={styles.memHeader}>
                  <Pressable onPress={() => moveMemMonth(-1)} hitSlop={10}>
                    <Text style={styles.memArrow}>‹</Text>
                  </Pressable>
                  <Text style={styles.memMonth}>
                    {memMonth.toLocaleDateString([], {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </Text>
                  <Pressable onPress={() => moveMemMonth(1)} hitSlop={10}>
                    <Text style={styles.memArrow}>›</Text>
                  </Pressable>
                </View>
                <View style={styles.memGrid}>
                  {Array.from({
                    length: new Date(
                      Date.UTC(memMonth.getUTCFullYear(), memMonth.getUTCMonth() + 1, 0)
                    ).getUTCDate(),
                  }).map((_, i) => {
                    const dayKey = `${memPrefix}-${String(i + 1).padStart(2, '0')}`;
                    const count = snapCounts.get(dayKey) ?? 0;
                    const has = count > 0;
                    return (
                      <Pressable
                        key={dayKey}
                        onPress={() => has && setMemDay(memDay === dayKey ? null : dayKey)}
                        style={[
                          styles.memCell,
                          has && styles.memCellHas,
                          memDay === dayKey && styles.memCellActive,
                        ]}
                      >
                        <Text style={[styles.memCellText, has && { color: '#D6336C' }]}>
                          {i + 1}
                        </Text>
                        {has && (
                          <Text style={{ fontSize: 8 }}>
                            💗{count > 1 ? `×${count}` : ''}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {snaps.length === 0 && (
                  <Text style={styles.gameHint}>
                    no memories this month yet · 📸 snap the doodle page to keep one forever
                  </Text>
                )}
                {(memDay ? snaps.filter((s) => s.day === memDay) : snaps.slice(0, 3)).map((s) => (
                  <View key={s.id} style={styles.memSnap}>
                    {s.art ? (
                      <Image source={{ uri: s.art }} style={styles.memArt} resizeMode="cover" />
                    ) : null}
                    {s.items.length > 0 && (
                      <SvgXml xml={itemsToSvg(s.items)} width="100%" height={200} />
                    )}
                    <View style={styles.memSnapMeta}>
                      <Text style={styles.memSnapDay}>
                        {new Date(`${s.day}T12:00:00Z`).toLocaleDateString([], {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      {s.author === userId && (
                        <Pressable onPress={() => handleDeleteSnap(s.id)} hitSlop={8}>
                          <Text style={styles.leaveText}>remove</Text>
                        </Pressable>
                      )}
                    </View>
                    {!!s.question && (
                      <Text style={styles.memQuestion}>💌 {s.question}</Text>
                    )}
                    {s.answers?.map((a) => (
                      <Text key={a.author} style={styles.memAnswer}>
                        {a.author === userId ? 'you' : partnerName}: “{a.text}”
                        {a.reaction ? `  ${a.reaction}` : ''}
                      </Text>
                    ))}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* link composer */}
      <Modal
        visible={linkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLinkModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Send them a link 🎁</Text>
            <Text style={styles.modalSub}>a song, a reel, anything you want them to open</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/…"
              placeholderTextColor={palette.inkFaint}
              value={linkInput}
              onChangeText={setLinkInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={{ marginTop: 12 }}>
              <Button
                label="send it 💌"
                onPress={handleShareLink}
                color="#F2789F"
                disabled={!linkInput.trim()}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* full-screen doodling */}
      <Modal
        visible={expandOpen}
        animationType="slide"
        onRequestClose={() => setExpandOpen(false)}
      >
        <View style={styles.expandRoot}>
          <View style={styles.expandHeader}>
            <Text style={styles.expandTitle}>your shared page ♡</Text>
            <Pressable onPress={() => setExpandOpen(false)} hitSlop={10}>
              <Text style={styles.expandClose}>done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <DrawingCanvas
              items={items}
              onStroke={handleStroke}
              onText={handleText}
              onFill={handleFill}
              onShape={handleShape}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClear}
              canUndo={items.some((s) => s.author === userId)}
              canRedo={redoStack.length > 0}
              canClear={items.length > 0}
              bigPalette
              zoomable
              onPickTraceImage={pickTraceImage}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* AI art: repaint the page Van Gogh style */}
      <Modal
        visible={aiOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAiOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => !aiBusy && setAiOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>✨ Van Gogh mode</Text>
            <Text style={styles.modalSub}>
              {aiImage ? 'your doodle, repainted ♡' : 'the AI repaints your page as a tiny masterpiece'}
            </Text>
            {aiImage ? (
              <Image source={{ uri: aiImage }} style={styles.aiImage} resizeMode="cover" />
            ) : (
              <View ref={aiViewRef} collapsable={false} style={styles.aiPreview}>
                <SvgXml xml={itemsToSvg(items)} width="100%" height="100%" />
              </View>
            )}
            <View style={{ marginTop: 12 }}>
              <Button
                label={aiBusy ? 'painting… (10-20s)' : aiImage ? '✨ repaint again' : '✨ repaint it'}
                onPress={handleAiRepaint}
                color="#9B7EDE"
                disabled={aiBusy || items.length === 0}
              />
            </View>
            {aiImage && !aiBusy && (
              <View style={{ marginTop: 10 }}>
                <Button
                  label="🖼 hang it on our page"
                  onPress={() => {
                    setArtView(true);
                    setAiOpen(false);
                  }}
                  color="#7FD1BE"
                  textColor={palette.ink}
                />
                <Pressable
                  onPress={() => {
                    setAiImage(null);
                    setArtView(false);
                  }}
                  style={{ marginTop: 10, alignItems: 'center' }}
                  hitSlop={6}
                >
                  <Text style={styles.canvasToolText}>✕ discard the painting</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiRain emoji={rain.emoji || null} burstKey={rain.key} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: palette.bg },
  container: { padding: 20, paddingTop: 26 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: {
    fontFamily: serif,
    fontSize: 22,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 8,
  },
  title: { fontFamily: serif, fontSize: 30, color: palette.ink, fontWeight: '700' as const },
  duoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  duoHeart: { fontSize: 24 },
  duoHeartSmall: { fontSize: 14 },
  introTitle: {
    fontFamily: serif,
    fontSize: 21,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 10,
  },
  introText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: palette.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  joinLabel: { fontSize: 14, fontWeight: '700', color: palette.ink },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.ink,
  },
  codeText: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 8,
    color: '#D6336C',
    marginVertical: 8,
  },
  leaveText: { fontSize: 12, fontWeight: '700', color: palette.inkFaint },
  pairHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moodBubbles: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  moodBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairTitle: { fontFamily: serif, fontSize: 18, fontWeight: '700', color: palette.ink },
  pairSub: { fontSize: 12.5, color: '#B0688A', marginTop: 2, fontWeight: '700' },
  linkChip: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkChipText: { fontSize: 12.5, fontWeight: '700', color: palette.accent },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: palette.ink },
  sectionLabelSmall: { fontSize: 12, fontWeight: '700', color: palette.inkSoft, marginRight: 2 },
  shareLinkBtn: { fontSize: 12.5, fontWeight: '800', color: palette.accent },
  moodRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  moodPick: {
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.bg,
    minWidth: 62,
  },
  moodPickActive: { borderColor: '#F2789F', backgroundColor: '#FDE8EF' },
  moodPickLabel: { fontSize: 9.5, fontWeight: '700', color: palette.inkSoft, marginTop: 2 },
  moodCaption: {
    marginTop: 10,
    backgroundColor: palette.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  moodLine: { fontSize: 12.5, color: palette.inkSoft, fontWeight: '600' },
  reactRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    gap: 8,
  },
  reactBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.bg,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  reactLabel: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  reactHint: { fontSize: 12, color: palette.inkFaint, fontStyle: 'italic' },
  subTabs: {
    flexDirection: 'row',
    backgroundColor: palette.line,
    borderRadius: 999,
    padding: 3,
    gap: 4,
    marginTop: 14,
  },
  subTabBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  subTabBtnActive: { backgroundColor: palette.card },
  subTabText: { fontSize: 16 },
  canvasHint: {
    fontSize: 11.5,
    color: palette.inkFaint,
    marginTop: 10,
    lineHeight: 16,
    textAlign: 'center',
  },
  birdFrame: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F6DCE5',
  },
  birdImage: { width: '100%', aspectRatio: 393 / 187, height: undefined },
  phrase: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 12 },
  gameStatsRow: { flexDirection: 'row', gap: 14, marginTop: 6, alignItems: 'center' },
  gameStat: { fontSize: 12, fontWeight: '800', color: palette.inkSoft },
  freezeNote: { fontSize: 12, fontWeight: '700', color: '#4FA8E8', marginTop: 8 },
  gameHint: {
    fontSize: 11.5,
    color: palette.inkFaint,
    marginTop: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  questKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#B0688A',
  },
  questQuestion: {
    fontFamily: serif,
    fontSize: 19,
    lineHeight: 27,
    color: palette.ink,
    fontWeight: '700',
    marginTop: 6,
  },
  questInput: {
    marginTop: 12,
    minHeight: 90,
    backgroundColor: palette.bg,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    lineHeight: 21,
    color: palette.ink,
    textAlignVertical: 'top',
  },
  questHint: {
    fontSize: 11.5,
    color: palette.inkFaint,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  questWaiting: { fontSize: 13.5, color: palette.inkSoft, fontWeight: '700', marginTop: 8 },
  answerCardTheirs: {
    marginTop: 12,
    backgroundColor: '#FDE8EF',
    borderRadius: 14,
    padding: 14,
    alignSelf: 'stretch',
  },
  answerCardMine: {
    marginTop: 10,
    backgroundColor: palette.bg,
    borderRadius: 14,
    padding: 14,
    alignSelf: 'stretch',
  },
  answerAuthor: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#B0688A',
  },
  answerText: { fontSize: 15, lineHeight: 22, color: palette.ink, marginTop: 6 },
  answerReactRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  answerReactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  answerReactBtnActive: { borderColor: '#F2789F' },
  xoScore: { fontSize: 13, fontWeight: '800', color: palette.inkSoft },
  xoHint: { fontSize: 12.5, fontWeight: '700', color: '#D6336C', marginTop: 6 },
  canvasToolbar: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  canvasToolBtn: {
    backgroundColor: palette.bg,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  canvasToolBtnActive: { backgroundColor: '#FDE8EF', borderWidth: 1.5, borderColor: '#F2789F' },
  canvasToolText: { fontSize: 12.5, fontWeight: '800', color: palette.accent },
  snapHint: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#2F9E44',
    textAlign: 'center',
    marginBottom: 8,
  },
  cheerNote: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#D6336C',
    marginTop: 8,
    textAlign: 'center',
  },
  noteReactionLine: { fontSize: 12, fontWeight: '700', color: '#B0688A', marginTop: 8 },
  unlinkBanner: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
  },
  unlinkText: { fontSize: 12.5, fontWeight: '700', color: palette.inkSoft, lineHeight: 18 },
  unlinkBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  keepUsBtn: {
    backgroundColor: '#F2789F',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  keepUsText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  confirmUnlinkBtn: {
    backgroundColor: palette.line,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  confirmUnlinkText: { color: palette.inkSoft, fontWeight: '800', fontSize: 12.5 },
  memArt: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 8 },
  expandRoot: { flex: 1, backgroundColor: palette.bg, paddingTop: 40 },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  expandTitle: { fontFamily: serif, fontSize: 20, fontWeight: '700', color: palette.ink },
  expandClose: { fontSize: 15, fontWeight: '800', color: palette.accent },
  aiPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF7FA',
    borderWidth: 2,
    borderColor: '#F6DCE5',
  },
  aiImage: { width: '100%', aspectRatio: 1, borderRadius: 16 },
  gameSwitch: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  gameSwitchBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: palette.line,
  },
  gameSwitchBtnActive: { backgroundColor: '#FDE8EF' },
  gameSwitchText: { fontSize: 12, fontWeight: '800', color: palette.inkSoft },
  hangWord: {
    fontFamily: serif,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 4,
    color: palette.ink,
    marginTop: 10,
  },
  alphaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 12,
  },
  alphaKey: {
    width: 32,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#F6DCE5',
  },
  alphaKeyUsed: { backgroundColor: palette.line, borderColor: 'transparent' },
  alphaKeyText: { fontSize: 15, fontWeight: '800', color: palette.ink },
  rpsRow: { flexDirection: 'row', gap: 14, marginTop: 14 },
  rpsBtn: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F6DCE5',
  },
  memHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  memArrow: { fontSize: 22, fontWeight: '800', color: palette.accent },
  memMonth: { fontSize: 14, fontWeight: '800', color: palette.ink, minWidth: 140, textAlign: 'center' },
  memGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 12 },
  memCell: {
    width: '12.28%',
    aspectRatio: 0.9,
    borderRadius: 10,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memCellHas: { backgroundColor: '#FDE8EF' },
  memCellActive: { borderWidth: 2, borderColor: '#F2789F' },
  memCellText: { fontSize: 11, fontWeight: '700', color: palette.inkSoft },
  memSnap: {
    marginTop: 14,
    backgroundColor: palette.bg,
    borderRadius: 16,
    padding: 12,
  },
  memSnapMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  memSnapDay: { fontSize: 12.5, fontWeight: '800', color: '#B0688A' },
  memQuestion: {
    fontFamily: serif,
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 8,
  },
  memAnswer: { fontSize: 13, lineHeight: 19, color: palette.inkSoft, marginTop: 4 },
  xoBoard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 74 + 2 * 8,
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  xoCell: {
    width: 74,
    height: 74,
    borderRadius: 16,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xoCellOpen: { borderWidth: 2, borderColor: '#F6DCE5', backgroundColor: '#FFFDFE' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,36,51,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 90,
    paddingHorizontal: 24,
  },
  modalCard: { backgroundColor: palette.card, borderRadius: 20, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  modalSub: { fontSize: 12.5, color: palette.inkSoft, marginTop: 2, marginBottom: 12 },
  error: {
    marginTop: 14,
    color: palette.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
});
