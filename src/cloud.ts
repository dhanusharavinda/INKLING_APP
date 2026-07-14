import { supabase } from './supabase';
import {
  CanvasItem,
  Entry,
  GameState,
  HangmanState,
  LoveNote,
  PairAnswer,
  PairEvent,
  PairGameState,
  PairInfo,
  PairSnap,
  RpsState,
  XoState,
} from './types';

// Turns raw fetch/DNS failures into something a human can act on.
export function friendlyCloudError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/UnknownHost|resolve host|Network request failed|fetch failed|Failed to fetch/i.test(msg)) {
    return 'Cannot reach the cloud. Check your internet, and make sure your Supabase project is active (free projects pause after inactivity: open supabase.com/dashboard and press Restore).';
  }
  return msg;
}

export interface CloudSession {
  userId: string;
  email: string | null;
}

// Settings that are safe to sync (the OpenAI key is never sent to the cloud).
export interface CloudSettings {
  name: string;
  autoTailor: boolean;
  onboarded: boolean;
}

// ---------- row <-> app mappers ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToEntry(r: any): Entry {
  return {
    id: r.id,
    createdAt: Date.parse(r.created_at),
    text: r.text,
    rawTranscript: r.raw_transcript ?? undefined,
    inputType: r.input_type === 'voice' ? 'voice' : 'text',
    tailored: !!r.tailored,
    analysis: r.analysis,
    sample: r.sample || undefined,
  };
}

function entryToRow(e: Entry, userId: string): any {
  return {
    id: e.id,
    user_id: userId,
    created_at: new Date(e.createdAt).toISOString(),
    text: e.text,
    raw_transcript: e.rawTranscript ?? null,
    input_type: e.inputType,
    tailored: e.tailored,
    analysis: e.analysis,
    sample: !!e.sample,
  };
}

// ---------- auth ----------

// Realtime must carry the USER's token, not the anon key: RLS-protected
// postgres_changes are silently filtered to nothing for unauthenticated
// sockets, which looks exactly like "live sync not working".
function applyRealtimeAuth(token: string | null | undefined) {
  if (supabase && token) {
    try {
      supabase.realtime.setAuth(token);
    } catch {
      // older client without setAuth; the auth listener still covers it
    }
  }
}

export async function getSession(): Promise<CloudSession | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  applyRealtimeAuth(data.session?.access_token);
  return u ? { userId: u.id, email: u.email ?? null } : null;
}

export function onAuthChange(cb: (s: CloudSession | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    applyRealtimeAuth(session?.access_token);
    const u = session?.user;
    cb(u ? { userId: u.id, email: u.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}

export interface AuthResult {
  session: CloudSession | null;
  needsConfirmation: boolean;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  const u = data.user;
  const session = data.session?.user
    ? { userId: data.session.user.id, email: data.session.user.email ?? null }
    : null;
  // When email confirmation is on, Supabase returns a user but no session.
  return { session, needsConfirmation: !!u && !data.session };
}

export async function signIn(email: string, password: string): Promise<CloudSession> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  applyRealtimeAuth(data.session?.access_token);
  const u = data.user;
  return { userId: u.id, email: u.email ?? null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ---------- forgot password (emailed 6-digit code, no deep links) ----------

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw new Error(error.message);
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'recovery',
  });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.auth.updateUser({ password: newPassword });
  if (e2) throw new Error(e2.message);
}

// ---------- entries ----------

export async function fetchEntries(userId: string): Promise<Entry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToEntry);
}

export async function insertEntry(e: Entry, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('entries').insert(entryToRow(e, userId));
  if (error) throw new Error(error.message);
}

export async function insertEntries(entries: Entry[], userId: string): Promise<void> {
  if (!supabase || entries.length === 0) return;
  const { error } = await supabase.from('entries').insert(entries.map((e) => entryToRow(e, userId)));
  if (error) throw new Error(error.message);
}

export async function deleteEntry(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function deleteSampleEntries(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('user_id', userId)
    .eq('sample', true);
  if (error) throw new Error(error.message);
}

// ---------- game state ----------

export async function fetchGame(userId: string): Promise<GameState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('game_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    xp: data.xp ?? 0,
    streak: data.streak ?? 0,
    bestStreak: data.best_streak ?? 0,
    lastEntryDay: data.last_entry_day ?? null,
    badges: Array.isArray(data.badges) ? data.badges : [],
  };
}

export async function upsertGame(game: GameState, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('game_state').upsert({
    user_id: userId,
    xp: game.xp,
    streak: game.streak,
    best_streak: game.bestStreak,
    last_entry_day: game.lastEntryDay,
    badges: game.badges,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------- settings (no API key) ----------

export async function fetchSettings(userId: string): Promise<CloudSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    name: data.name ?? '',
    autoTailor: data.auto_tailor ?? true,
    onboarded: !!data.onboarded,
  };
}

export async function upsertSettings(s: CloudSettings, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    name: s.name,
    auto_tailor: s.autoTailor,
    onboarded: s.onboarded,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------- destructive ----------

export async function deleteAllData(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('entries').delete().eq('user_id', userId);
  await supabase.from('game_state').delete().eq('user_id', userId);
  await supabase.from('user_settings').delete().eq('user_id', userId);
}

export async function deleteAccount(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('delete_user');
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}

// ---------- couples / friends: pairing + shared notes ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPair(r: any): PairInfo {
  return {
    id: r.id,
    code: r.code,
    userA: r.user_a,
    userB: r.user_b ?? null,
    nameA: r.name_a ?? '',
    nameB: r.name_b ?? '',
    unlinkRequestedBy: r.unlink_requested_by ?? null,
  };
}

// The stroke jsonb holds either a drawn line or a placed text sticker
// ({kind:'text',...}); rows from before the text feature are plain strokes.
const clampNum = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;

function rowToCanvasItem(r: any): CanvasItem {
  const s = (r.stroke ?? {}) as Record<string, unknown>;
  if (s.kind === 'fill') {
    return {
      kind: 'fill',
      id: r.id,
      author: r.author,
      color: typeof s.color === 'string' ? s.color : '#FFF7FA',
    };
  }
  if (s.kind === 'shape') {
    return {
      kind: 'shape',
      id: r.id,
      author: r.author,
      color: typeof s.color === 'string' ? s.color : '#F2789F',
      points: Array.isArray(s.points) ? (s.points as number[]) : [],
    };
  }
  if (s.kind === 'text') {
    // Partner rows are untrusted: clamp geometry and cap length on ingestion
    // so the live canvas and the widget render the same, sane thing.
    return {
      kind: 'text',
      id: r.id,
      author: r.author,
      text: typeof s.text === 'string' ? s.text.slice(0, 120) : '',
      x: clampNum(s.x, 0, 100, 50),
      y: clampNum(s.y, 0, 100, 50),
      size: clampNum(s.size, 3, 40, 9),
      color: typeof s.color === 'string' ? s.color : '#3A3340',
      rotation: clampNum(s.rotation, -3600, 3600, 0),
    };
  }
  return {
    kind: 'stroke',
    id: r.id,
    author: r.author,
    color: typeof s.color === 'string' ? s.color : '#3A3340',
    width: typeof s.width === 'number' ? s.width : 4,
    points: Array.isArray(s.points) ? (s.points as number[]) : [],
  };
}

function rowToPairEvent(r: any): PairEvent {
  return {
    id: r.id,
    pairId: r.pair_id,
    author: r.author,
    kind: r.kind === 'reaction' ? 'reaction' : r.kind === 'link' ? 'link' : 'mood',
    value: String(r.value ?? ''),
    createdAt: Date.parse(r.created_at),
  };
}

export async function fetchMyPair(): Promise<PairInfo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('pairs').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToPair(data) : null;
}

export async function createPair(displayName: string): Promise<{ id: string; code: string }> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.rpc('create_pair', { display_name: displayName });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.pair_id, code: row.invite_code };
}

export async function joinPair(code: string, displayName: string): Promise<string> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.rpc('join_pair', {
    invite_code: code,
    display_name: displayName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function leavePair(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('leave_pair');
  if (error) throw new Error(error.message);
}

// Ask to unlink. 'requested' means the partner still has to agree;
// 'deleted' means the pair is gone (they had already asked, or it was a
// pending invite with no partner yet).
export async function requestUnlink(): Promise<'requested' | 'deleted' | 'gone'> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.rpc('request_unlink');
  if (error) throw new Error(error.message);
  return data === 'deleted' || data === 'gone' ? data : 'requested';
}

export async function cancelUnlink(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('cancel_unlink');
  if (error) throw new Error(error.message);
}

// ---------- shared canvas ----------

export async function fetchCanvas(pairId: string, limit = 1200): Promise<CanvasItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('canvas_strokes')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCanvasItem);
}

export async function addCanvasItem(pairId: string, item: CanvasItem): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const payload =
    item.kind === 'text'
      ? {
          kind: 'text',
          text: item.text,
          x: item.x,
          y: item.y,
          size: item.size,
          color: item.color,
          rotation: item.rotation,
        }
      : item.kind === 'fill'
      ? { kind: 'fill', color: item.color }
      : item.kind === 'shape'
      ? { kind: 'shape', color: item.color, points: item.points }
      : { color: item.color, width: item.width, points: item.points };
  const { error } = await supabase.from('canvas_strokes').insert({
    id: item.id,
    pair_id: pairId,
    author: item.author,
    stroke: payload,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCanvasStroke(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('canvas_strokes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function clearCanvas(pairId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('canvas_strokes').delete().eq('pair_id', pairId);
  if (error) throw new Error(error.message);
}

// Channel topics must be unique per subscription: supabase-js returns an
// existing channel for a repeated name, and adding callbacks to an
// already-subscribed channel throws (the "blank Us tab" bug).
let channelSeq = 0;
const uniqueTopic = (base: string) => `${base}-${++channelSeq}-${Date.now().toString(36)}`;

type AnyChannel = ReturnType<NonNullable<typeof supabase>['channel']>;

// Subscribe with automatic recovery: network blips, token refreshes, and
// server-side closes silently kill realtime channels, so a dead channel is
// torn down and rebuilt until the caller unsubscribes.
function subscribeWithRetry(build: () => AnyChannel): () => void {
  let disposed = false;
  let channel: AnyChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    if (disposed || !supabase) return;
    channel = build();
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (channel) {
          supabase!.removeChannel(channel).catch(() => {});
          channel = null;
        }
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            start();
          }, 2500);
        }
      }
    });
  };
  start();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (channel && supabase) supabase.removeChannel(channel).catch(() => {});
  };
}

// Live items: partner lines/stickers appear as they land; undo/clear vanish.
export function onCanvasChange(
  pairId: string,
  handlers: { onInsert: (s: CanvasItem) => void; onDelete: (id: string) => void }
): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`canvas-${pairId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'canvas_strokes', filter: `pair_id=eq.${pairId}` },
        (payload) => handlers.onInsert(rowToCanvasItem(payload.new))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'canvas_strokes', filter: `pair_id=eq.${pairId}` },
        (payload) => {
          const id = (payload.old as { id?: string } | null)?.id;
          if (id) handlers.onDelete(id);
        }
      )
  );
}

// ---------- moods + comfort reactions ----------

export async function sendPairEvent(
  pairId: string,
  author: string,
  kind: 'mood' | 'reaction' | 'link',
  value: string,
  id: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.from('pair_events').insert({
    id,
    pair_id: pairId,
    author,
    kind,
    value,
  });
  if (error) throw new Error(error.message);
}

// Latest mood per person (for "{name} is feeling ..." lines). Queried per
// author so one chatty person's mood history can never bury the other's.
export async function fetchLatestMoods(pairId: string, authorIds: string[]): Promise<PairEvent[]> {
  if (!supabase) return [];
  const results = await Promise.all(
    authorIds.filter(Boolean).map(async (author) => {
      const { data, error } = await supabase!
        .from('pair_events')
        .select('*')
        .eq('pair_id', pairId)
        .eq('kind', 'mood')
        .eq('author', author)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return data && data.length > 0 ? rowToPairEvent(data[0]) : null;
    })
  );
  return results.filter((e): e is PairEvent => e !== null);
}

export function onPairEvent(pairId: string, cb: (e: PairEvent) => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-events-${pairId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pair_events', filter: `pair_id=eq.${pairId}` },
        (payload) => cb(rowToPairEvent(payload.new))
      )
  );
}

// The newest event of one kind (latest reaction for the couple status line,
// latest shared link for the "sent you something" chip).
export async function fetchLatestEvent(
  pairId: string,
  kind: 'reaction' | 'link'
): Promise<PairEvent | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pair_events')
    .select('*')
    .eq('pair_id', pairId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? rowToPairEvent(data[0]) : null;
}

// ---------- the "together" tap game ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToGame(r: any): PairGameState {
  return {
    taps: Number(r.taps) || 0,
    tapsA: Number(r.taps_a) || 0,
    tapsB: Number(r.taps_b) || 0,
    day: String(r.day ?? ''),
    streak: Number(r.streak) || 0,
    lastStreakDay: String(r.last_streak_day ?? ''),
    lastFreezeDay: String(r.last_freeze_day ?? ''),
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

export async function fetchPairGame(pairId: string): Promise<PairGameState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pair_game')
    .select('*')
    .eq('pair_id', pairId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToGame(data) : null;
}

export async function gameTap(count = 1): Promise<PairGameState> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.rpc('game_tap', { tap_count: count });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return rowToGame(row);
}

export function onGameChange(pairId: string, cb: (g: PairGameState) => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-game-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_game', filter: `pair_id=eq.${pairId}` },
        (payload) => {
          const r = payload.new as { updated_at?: string } | null;
          if (r && r.updated_at) cb(rowToGame(r));
        }
      )
  );
}

// ---------- XO: tiny tic-tac-toe ----------

function rowToXo(r: any): XoState {
  const b = typeof r.board === 'string' && r.board.length === 9 ? r.board : '.........';
  return {
    board: b,
    nextTurn: r.next_turn === 'O' ? 'O' : 'X',
    winner: r.winner === 'X' || r.winner === 'O' || r.winner === 'draw' ? r.winner : '',
    winsA: Number(r.wins_a) || 0,
    winsB: Number(r.wins_b) || 0,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

export async function fetchXo(pairId: string): Promise<XoState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pair_xo')
    .select('*')
    .eq('pair_id', pairId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToXo(data) : null;
}

export async function xoMove(pos: number): Promise<XoState> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.rpc('xo_move', { pos });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return rowToXo(row);
}

export async function xoReset(): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.rpc('xo_reset');
  if (error) throw new Error(error.message);
}

export function onXoChange(pairId: string, cb: (x: XoState) => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-xo-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_xo', filter: `pair_id=eq.${pairId}` },
        (payload) => {
          const r = payload.new as { updated_at?: string } | null;
          if (r && r.updated_at) cb(rowToXo(r));
        }
      )
  );
}

// ---------- daily question: answers + reveal reactions ----------

function rowToAnswer(r: any): PairAnswer {
  return {
    day: String(r.day ?? ''),
    author: String(r.author ?? ''),
    text: String(r.text ?? ''),
    reaction: String(r.reaction ?? ''),
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

// Returns what RLS lets us see: always my answer; the partner's only once I
// have answered too (the reveal rule lives in the database).
export async function fetchAnswers(pairId: string, day: string): Promise<PairAnswer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pair_answers')
    .select('*')
    .eq('pair_id', pairId)
    .eq('day', day);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToAnswer);
}

export async function submitAnswer(
  pairId: string,
  day: string,
  author: string,
  text: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.from('pair_answers').insert({
    pair_id: pairId,
    day,
    author,
    text,
  });
  if (error) throw new Error(error.message);
}

// My reaction to THEIR answer lives on MY row for the day.
export async function setAnswerReaction(
  pairId: string,
  day: string,
  author: string,
  reaction: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase
    .from('pair_answers')
    .update({ reaction })
    .eq('pair_id', pairId)
    .eq('day', day)
    .eq('author', author);
  if (error) throw new Error(error.message);
}

export function onAnswersChange(pairId: string, cb: () => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-answers-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_answers', filter: `pair_id=eq.${pairId}` },
        () => cb()
      )
  );
}

// ---------- Daily dose of 💌: a free little message stream ----------

function rowToNote(r: any): LoveNote {
  return {
    id: String(r.id ?? ''),
    author: String(r.author ?? ''),
    text: String(r.text ?? ''),
    reaction: String(r.reaction ?? ''),
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

// The most recent notes, newest first.
export async function fetchLoveNotes(pairId: string, limit = 30): Promise<LoveNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('shared_notes')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToNote);
}

export async function sendLoveNote(
  pairId: string,
  author: string,
  text: string,
  id: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.from('shared_notes').insert({
    id,
    pair_id: pairId,
    author,
    text,
  });
  if (error) throw new Error(error.message);
}

export async function deleteLoveNote(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('shared_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// React to the PARTNER's note (the database refuses reactions to my own).
export async function reactToLoveNote(noteId: string, emoji: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.rpc('note_react', { note_id: noteId, emoji });
  if (error) throw new Error(error.message);
}

export function onLoveNotesChange(pairId: string, cb: () => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`love-notes-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_notes', filter: `pair_id=eq.${pairId}` },
        () => cb()
      )
  );
}

// ---------- snaps: the memories calendar ----------

function rowToSnap(r: any): PairSnap {
  // art can be a hefty data URI; only trust real PNG/JPEG data URIs
  const art =
    typeof r.art === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(r.art)
      ? r.art
      : null;
  return {
    id: r.id,
    author: r.author,
    day: String(r.day ?? ''),
    items: Array.isArray(r.items) ? (r.items as PairSnap['items']).map((it: any) => it) : [],
    question: String(r.question ?? ''),
    answers: Array.isArray(r.answers) ? r.answers : null,
    art,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

// All snaps in a month ('YYYY-MM'), newest day first.
export async function fetchSnaps(pairId: string, monthPrefix: string): Promise<PairSnap[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pair_snaps')
    .select('*')
    .eq('pair_id', pairId)
    .like('day', `${monthPrefix}%`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSnap);
}

export async function saveSnap(pairId: string, snap: PairSnap): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.from('pair_snaps').insert({
    id: snap.id,
    pair_id: pairId,
    author: snap.author,
    day: snap.day,
    items: snap.items,
    question: snap.question,
    answers: snap.answers,
    art: snap.art,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSnap(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('pair_snaps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- hangman ----------

function rowToHangman(r: any): HangmanState {
  const status = ['idle', 'playing', 'won', 'lost'].includes(r.status) ? r.status : 'idle';
  return {
    setter: r.setter ?? null,
    word: String(r.word ?? ''),
    guessed: String(r.guessed ?? ''),
    wrongs: Number(r.wrongs) || 0,
    status,
    winsA: Number(r.wins_a) || 0,
    winsB: Number(r.wins_b) || 0,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

export async function fetchHangman(pairId: string): Promise<HangmanState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pair_hangman')
    .select('*')
    .eq('pair_id', pairId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToHangman(data) : null;
}

export async function hangmanStart(secret: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.rpc('hangman_start', { secret });
  if (error) throw new Error(error.message);
}

export async function hangmanGuess(letter: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.rpc('hangman_guess', { letter });
  if (error) throw new Error(error.message);
}

export function onHangmanChange(pairId: string, cb: (h: HangmanState) => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-hangman-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_hangman', filter: `pair_id=eq.${pairId}` },
        (payload) => {
          const r = payload.new as { updated_at?: string } | null;
          if (r && r.updated_at) cb(rowToHangman(r));
        }
      )
  );
}

// ---------- rock paper scissors ----------

function rowToRps(r: any, iAmA: boolean): RpsState {
  const a = String(r.choice_a ?? '');
  const b = String(r.choice_b ?? '');
  return {
    myChoicePending: iAmA ? a !== '' : b !== '',
    theirChoicePending: iAmA ? b !== '' : a !== '',
    lastA: String(r.last_a ?? ''),
    lastB: String(r.last_b ?? ''),
    lastResult: ['a', 'b', 'draw'].includes(r.last_result) ? r.last_result : '',
    winsA: Number(r.wins_a) || 0,
    winsB: Number(r.wins_b) || 0,
    draws: Number(r.draws) || 0,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

export async function fetchRps(pairId: string, iAmA: boolean): Promise<RpsState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pair_rps')
    .select('*')
    .eq('pair_id', pairId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRps(data, iAmA) : null;
}

export async function rpsPlay(choice: 'rock' | 'paper' | 'scissors'): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.rpc('rps_play', { choice });
  if (error) throw new Error(error.message);
}

export function onRpsChange(pairId: string, iAmA: boolean, cb: (r: RpsState) => void): () => void {
  if (!supabase) return () => {};
  return subscribeWithRetry(() =>
    supabase!
      .channel(uniqueTopic(`pair-rps-${pairId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_rps', filter: `pair_id=eq.${pairId}` },
        (payload) => {
          const r = payload.new as { updated_at?: string } | null;
          if (r && r.updated_at) cb(rowToRps(r, iAmA));
        }
      )
  );
}
