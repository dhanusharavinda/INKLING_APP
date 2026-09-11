-- ===========================================================================
-- Inkling - Supabase schema, multi-tenant isolation via Row Level Security.
-- Run this once in your project's SQL editor (Dashboard -> SQL -> New query).
-- Safe to re-run: it uses "if not exists" / "drop policy if exists".
-- ===========================================================================

-- ---------- entries -------------------------------------------------------
create table if not exists public.entries (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null,           -- the entry's (possibly backdated) date
  text          text not null,
  raw_transcript text,
  input_type    text not null default 'text',
  tailored      boolean not null default false,
  analysis      jsonb not null,
  sample        boolean not null default false,
  inserted_at   timestamptz not null default now()
);
create index if not exists entries_user_created_idx
  on public.entries (user_id, created_at desc);

-- ---------- game state (one row per user) ---------------------------------
create table if not exists public.game_state (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  xp           integer not null default 0,
  streak       integer not null default 0,
  best_streak  integer not null default 0,
  last_entry_day text,
  badges       jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ---------- user settings (one row per user) ------------------------------
-- Note: the OpenAI API key is intentionally NOT stored here. It stays on the
-- device only, so your secret never touches the database.
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  auto_tailor boolean not null default true,
  onboarded   boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- ---------- Row Level Security -------------------------------------------
alter table public.entries       enable row level security;
alter table public.game_state    enable row level security;
alter table public.user_settings enable row level security;

-- entries: a user may read / create / delete only their own rows.
-- There is deliberately NO update policy, so entry content is IMMUTABLE once
-- written (the app never edits an existing journal entry).
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select using (user_id = auth.uid());
drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert with check (user_id = auth.uid());
drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries
  for delete using (user_id = auth.uid());

-- game_state: full read/write of own row.
drop policy if exists game_all on public.game_state;
create policy game_all on public.game_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_settings: full read/write of own row.
drop policy if exists settings_all on public.user_settings;
create policy settings_all on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- daily rate limit (max 6 entries per user per day) -------------
-- Enforced in the database so it holds no matter what client inserts. Counts
-- by inserted_at (real time), so backdating an entry cannot dodge the cap.
create or replace function public.enforce_daily_entry_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  select count(*) into used
  from public.entries
  where user_id = new.user_id
    and inserted_at >= date_trunc('day', now())
    and inserted_at <  date_trunc('day', now()) + interval '1 day';
  if used >= 6 then
    raise exception 'Daily limit of 6 entries reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_daily_limit on public.entries;
create trigger entries_daily_limit
  before insert on public.entries
  for each row execute function public.enforce_daily_entry_limit();

-- ---------- couples / friends: pairs + shared notes -----------------------
-- Two people link accounts with a 6-letter invite code, then share cute notes
-- (text + emotion + a small drawing). Widgets on both phones show the latest.

create table if not exists public.pairs (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid references auth.users (id) on delete cascade,
  name_a     text not null default '',
  name_b     text not null default '',
  created_at timestamptz not null default now()
);
-- Unlinking needs both hearts: one asks, the other confirms.
alter table public.pairs add column if not exists unlink_requested_by uuid;

create table if not exists public.shared_notes (
  id          text primary key,
  pair_id     uuid not null references public.pairs (id) on delete cascade,
  author      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null default '',
  emotion     text not null default 'love',
  drawing     jsonb,               -- array of strokes {color,width,points:[x,y,...]}
  created_at  timestamptz not null default now()
);
-- The partner's emoji reaction to this note (Daily dose of 💌 stream).
alter table public.shared_notes add column if not exists reaction text not null default '';
create index if not exists shared_notes_pair_idx
  on public.shared_notes (pair_id, created_at desc);

alter table public.pairs        enable row level security;
alter table public.shared_notes enable row level security;

-- pairs: members can read their own pair; joining happens via the RPCs below.
drop policy if exists pairs_select on public.pairs;
create policy pairs_select on public.pairs
  for select using (user_a = auth.uid() or user_b = auth.uid());

-- shared notes: only the two members can read; only members may write as
-- themselves; the author may delete their note. No update (notes stay true).
drop policy if exists shared_select on public.shared_notes;
create policy shared_select on public.shared_notes
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists shared_insert on public.shared_notes;
create policy shared_insert on public.shared_notes
  for insert with check (
    author = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists shared_delete on public.shared_notes;
create policy shared_delete on public.shared_notes
  for delete using (author = auth.uid());

-- Create (or return) my pair and its invite code. A per-user advisory lock
-- serializes concurrent calls, and code generation retries on the rare
-- collision (6 hex chars, unique).
create or replace function public.create_pair(display_name text default '')
returns table (pair_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pairs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into p from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if found then
    return query select p.id, p.code;
    return;
  end if;
  loop
    begin
      insert into public.pairs (code, user_a, name_a)
        values (
          upper(substr(md5(gen_random_uuid()::text), 1, 6)),
          auth.uid(),
          coalesce(display_name, '')
        )
        returning * into p;
      exit;
    exception when unique_violation then
      -- invite code collided with an existing pair; roll a new one
    end;
  end loop;
  return query select p.id, p.code;
end;
$$;

-- Join a partner's pair using their invite code. The claim itself is an atomic
-- conditional update, so two people racing for the same code cannot both win.
create or replace function public.join_pair(invite_code text, display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pairs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.pairs where user_a = auth.uid() or user_b = auth.uid()) then
    raise exception 'You are already linked with someone.';
  end if;
  select * into p from public.pairs where code = upper(trim(invite_code));
  if not found then
    raise exception 'That code was not found. Check it and try again.';
  end if;
  if p.user_a = auth.uid() then
    raise exception 'That is your own code. Share it with your person instead.';
  end if;
  update public.pairs
    set user_b = auth.uid(), name_b = coalesce(display_name, '')
    where id = p.id and user_b is null;
  if not found then
    raise exception 'That pair is already complete.';
  end if;
  return p.id;
end;
$$;

-- Leave my pair (deletes the pair and its notes for both).
create or replace function public.leave_pair()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pairs where user_a = auth.uid() or user_b = auth.uid();
end;
$$;

-- Unlinking a COMPLETE pair takes both people: the first call only marks a
-- request; the pair is deleted when the OTHER person also asks. A pending
-- invite (no partner yet) is mine alone, so it deletes immediately.
create or replace function public.request_unlink()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pairs%rowtype;
begin
  select * into p from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    for update;
  if not found then
    return 'gone';
  end if;
  if p.user_b is null then
    delete from public.pairs where id = p.id;
    return 'deleted';
  end if;
  if p.unlink_requested_by is null or p.unlink_requested_by = auth.uid() then
    update public.pairs set unlink_requested_by = auth.uid() where id = p.id;
    return 'requested';
  end if;
  -- the other person already asked; my call is the confirmation
  delete from public.pairs where id = p.id;
  return 'deleted';
end;
$$;

-- Either person can call off a pending unlink ("keep us").
create or replace function public.cancel_unlink()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pairs set unlink_requested_by = null
    where (user_a = auth.uid() or user_b = auth.uid())
      and unlink_requested_by is not null;
end;
$$;

-- React to a note in the Daily dose of 💌 stream (only pair members, and only
-- to the PARTNER's note; the reaction column is the only thing it can touch).
create or replace function public.note_react(note_id text, emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_notes n
    set reaction = left(coalesce(emoji, ''), 8)
    where n.id = note_id
      and n.author <> auth.uid()
      and exists (
        select 1 from public.pairs p
        where p.id = n.pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
      );
end;
$$;

revoke all on function public.create_pair(text) from public;
revoke all on function public.join_pair(text, text) from public;
revoke all on function public.leave_pair() from public;
revoke all on function public.request_unlink() from public;
revoke all on function public.cancel_unlink() from public;
revoke all on function public.note_react(text, text) from public;
grant execute on function public.create_pair(text) to authenticated;
grant execute on function public.join_pair(text, text) to authenticated;
grant execute on function public.leave_pair() to authenticated;
grant execute on function public.request_unlink() to authenticated;
grant execute on function public.cancel_unlink() to authenticated;
grant execute on function public.note_react(text, text) to authenticated;

-- Live sync: notes stream to the partner instantly while the app is open.
-- Replica identity full lets DELETE events carry the row (so the pair filter
-- matches and the partner's screen can remove the note live).
alter table public.shared_notes replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.shared_notes;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- shared canvas: one living doodle board per pair ---------------
-- Every stroke is a row, so both people draw on the SAME canvas and each
-- stroke streams live to the partner. Erasing is drawing in the background
-- color; undo deletes your own last stroke; clear wipes the board for both.

create table if not exists public.canvas_strokes (
  id         text primary key,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stroke     jsonb not null,        -- {color, width, points:[x,y,...]}
  created_at timestamptz not null default now()
);
create index if not exists canvas_strokes_pair_idx
  on public.canvas_strokes (pair_id, created_at);

alter table public.canvas_strokes enable row level security;

drop policy if exists canvas_select on public.canvas_strokes;
create policy canvas_select on public.canvas_strokes
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists canvas_insert on public.canvas_strokes;
create policy canvas_insert on public.canvas_strokes
  for insert with check (
    author = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
-- either member may delete strokes (undo own, or clear the whole board)
drop policy if exists canvas_delete on public.canvas_strokes;
create policy canvas_delete on public.canvas_strokes
  for delete using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

alter table public.canvas_strokes replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.canvas_strokes;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- pair events: moods + comfort reactions + shared links ---------
-- kind 'mood'     -> value is a mood key ("joy", "mishing", "cuteagg", ...)
-- kind 'reaction' -> value is a reaction key ('hug', 'squish', 'mishback'...)
-- kind 'link'     -> value is an https URL (a song, a reel, anything)

create table if not exists public.pair_events (
  id         text primary key,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('mood', 'reaction', 'link')),
  value      text not null,
  created_at timestamptz not null default now()
);
-- widen the kind check on older installs (constraint predates 'link')
alter table public.pair_events drop constraint if exists pair_events_kind_check;
alter table public.pair_events
  add constraint pair_events_kind_check check (kind in ('mood', 'reaction', 'link'));
create index if not exists pair_events_pair_idx
  on public.pair_events (pair_id, created_at desc);

alter table public.pair_events enable row level security;

drop policy if exists pair_events_select on public.pair_events;
create policy pair_events_select on public.pair_events
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists pair_events_insert on public.pair_events;
create policy pair_events_insert on public.pair_events
  for insert with check (
    author = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.pair_events;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- the "together" tap game ----------------------------------------
-- Two birds on a wire. The pair shares a daily goal: 100 taps combined. Every
-- 25 taps the birds hop closer (4 pictures); at 100 they stay snuggled for the
-- day. Each day starts apart again. Reaching 100 keeps a day streak; missing
-- a day resets it. Days are UTC.

create table if not exists public.pair_game (
  pair_id         uuid primary key references public.pairs (id) on delete cascade,
  taps            integer not null default 0,
  taps_a          integer not null default 0,
  taps_b          integer not null default 0,
  day             text not null default '',
  streak          integer not null default 0,
  last_streak_day text not null default '',
  last_freeze_day text not null default '',
  freeze_week     text not null default '',
  freezes_used    integer not null default 0,
  updated_at      timestamptz not null default now()
);
-- migrate older installs
alter table public.pair_game add column if not exists taps integer not null default 0;
alter table public.pair_game add column if not exists taps_a integer not null default 0;
alter table public.pair_game add column if not exists taps_b integer not null default 0;
alter table public.pair_game add column if not exists day text not null default '';
alter table public.pair_game add column if not exists streak integer not null default 0;
alter table public.pair_game add column if not exists last_streak_day text not null default '';
alter table public.pair_game add column if not exists last_freeze_day text not null default '';
alter table public.pair_game add column if not exists freeze_week text not null default '';
alter table public.pair_game add column if not exists freezes_used integer not null default 0;
-- 🛟 lifeguards: earned one per 10 streak days, each saves one missed day
alter table public.pair_game add column if not exists lifeguards integer not null default 0;
alter table public.pair_game drop column if exists closeness;

-- A streak that already existed when lifeguards arrived had earned its saves
-- long before the column did, and a new column defaults to zero: that is how
-- a 25-day streak died with an empty bank. Grant what the current streak has
-- already earned, exactly once (the flag keeps re-runs from re-granting saves
-- that were legitimately spent).
alter table public.pair_game
  add column if not exists lifeguards_backfilled boolean not null default false;
update public.pair_game
  set lifeguards = greatest(lifeguards, streak / 10),
      lifeguards_backfilled = true
  where not lifeguards_backfilled;

alter table public.pair_game enable row level security;

drop policy if exists pair_game_select on public.pair_game;
create policy pair_game_select on public.pair_game
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

-- older versions returned different columns / had a different signature; a
-- return type cannot be changed in place, so drop both first
drop function if exists public.game_tap();
drop function if exists public.game_tap(integer);

-- tap_count lets clients batch rapid taps into one round-trip.
-- Each person can contribute at most 60 of the daily 100 ("it doesn't always
-- have to be 50-50, 60-40 is love too"). Every 10th streak day earns a 🛟
-- lifeguard; each lifeguard quietly saves ONE fully-missed day, so a lapse
-- only resets the streak when you don't have enough lifeguards to cover it.
create or replace function public.game_tap(tap_count integer default 1)
returns table (
  taps integer, taps_a integer, taps_b integer, day text,
  streak integer, last_streak_day text, last_freeze_day text,
  lifeguards integer, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.pairs%rowtype;
  g public.pair_game%rowtype;
  n integer := greatest(1, least(25, coalesce(tap_count, 1)));
  i_am_a boolean;
  my_taps integer;
  gap integer;
  today text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  yesterday text := to_char((now() at time zone 'utc') - interval '1 day', 'YYYY-MM-DD');
begin
  select * into pr from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if pr.id is null then
    raise exception 'You are not linked with anyone yet.';
  end if;
  i_am_a := (pr.user_a = auth.uid());

  insert into public.pair_game (pair_id, day) values (pr.id, today)
    on conflict (pair_id) do nothing;
  select * into g from public.pair_game pg where pg.pair_id = pr.id for update;

  -- a new day: birds start apart again
  if g.day <> today then
    g.taps := 0;
    g.taps_a := 0;
    g.taps_b := 0;
    g.day := today;
    if g.last_streak_day <> today and g.last_streak_day <> yesterday then
      -- missed day(s): one lifeguard rescues one day; spend only if the
      -- whole gap is covered, otherwise the streak resets (none are wasted)
      if g.last_streak_day ~ '^\d{4}-\d{2}-\d{2}$' then
        gap := (yesterday::date - g.last_streak_day::date);
      else
        gap := -1;
      end if;
      if gap >= 1 and g.lifeguards >= gap then
        g.lifeguards := g.lifeguards - gap;
        g.last_streak_day := yesterday;
        g.last_freeze_day := yesterday;
      else
        g.streak := 0;
      end if;
    end if;
  end if;

  -- personal 60-cap, shared 100-goal
  if i_am_a then
    my_taps := least(60, g.taps_a + n);
    g.taps_a := my_taps;
  else
    my_taps := least(60, g.taps_b + n);
    g.taps_b := my_taps;
  end if;
  g.taps := least(100, g.taps_a + g.taps_b);

  -- goal reached: bank today's streak once; every 10th day earns a 🛟
  if g.taps >= 100 and g.last_streak_day <> today then
    if g.last_streak_day = yesterday then
      g.streak := g.streak + 1;
    else
      g.streak := 1;
    end if;
    g.last_streak_day := today;
    if g.streak % 10 = 0 then
      g.lifeguards := g.lifeguards + 1;
    end if;
  end if;

  update public.pair_game pg
    set taps = g.taps, taps_a = g.taps_a, taps_b = g.taps_b, day = g.day,
        streak = g.streak, last_streak_day = g.last_streak_day,
        last_freeze_day = g.last_freeze_day, lifeguards = g.lifeguards,
        updated_at = now()
    where pg.pair_id = pr.id;

  return query
    select pg.taps, pg.taps_a, pg.taps_b, pg.day, pg.streak,
           pg.last_streak_day, pg.last_freeze_day, pg.lifeguards, pg.updated_at
    from public.pair_game pg where pg.pair_id = pr.id;
end;
$$;

revoke all on function public.game_tap(integer) from public;
grant execute on function public.game_tap(integer) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.pair_game;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- XO: a tiny tic-tac-toe for two --------------------------------
-- One shared board per pair. user_a plays 💗 (X), user_b plays ⭐ (O). Wins
-- are tallied; either player can start a fresh round once one ends.

create table if not exists public.pair_xo (
  pair_id    uuid primary key references public.pairs (id) on delete cascade,
  board      text not null default '.........',
  next_turn  text not null default 'X',
  winner     text not null default '',   -- '', 'X', 'O', 'draw'
  wins_a     integer not null default 0,
  wins_b     integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pair_xo enable row level security;
drop policy if exists pair_xo_select on public.pair_xo;
create policy pair_xo_select on public.pair_xo
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

create or replace function public.xo_check_winner(b text)
returns text
language plpgsql
immutable
as $$
declare
  lines integer[][] := array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
  l integer[];
  cells text;
  any_winnable boolean := false;
begin
  foreach l slice 1 in array lines loop
    if substr(b, l[1], 1) <> '.'
       and substr(b, l[1], 1) = substr(b, l[2], 1)
       and substr(b, l[2], 1) = substr(b, l[3], 1) then
      return substr(b, l[1], 1);
    end if;
    -- a line is still winnable only if it doesn't contain BOTH symbols
    cells := substr(b, l[1], 1) || substr(b, l[2], 1) || substr(b, l[3], 1);
    if not (position('X' in cells) > 0 and position('O' in cells) > 0) then
      any_winnable := true;
    end if;
  end loop;
  -- full board, or nobody can possibly win anymore: call it early
  if position('.' in b) = 0 or not any_winnable then
    return 'draw';
  end if;
  return '';
end;
$$;

create or replace function public.xo_move(pos integer)
returns table (board text, next_turn text, winner text, wins_a integer, wins_b integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.pairs%rowtype;
  x public.pair_xo%rowtype;
  me text;
begin
  if pos is null or pos < 1 or pos > 9 then
    raise exception 'Bad move.';
  end if;
  select * into pr from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if pr.id is null then
    raise exception 'You are not linked with anyone yet.';
  end if;
  insert into public.pair_xo (pair_id) values (pr.id)
    on conflict (pair_id) do nothing;
  select * into x from public.pair_xo px where px.pair_id = pr.id for update;

  me := case when pr.user_a = auth.uid() then 'X' else 'O' end;
  if x.winner <> '' then
    raise exception 'The round is over. Start a new one!';
  end if;
  -- on an empty board, whoever taps first starts; after that, turns alternate
  if x.board <> '.........' and x.next_turn <> me then
    raise exception 'Not your turn yet, patience ♡';
  end if;
  if substr(x.board, pos, 1) <> '.' then
    raise exception 'That spot is taken.';
  end if;

  x.board := overlay(x.board placing me from pos for 1);
  x.next_turn := case when me = 'X' then 'O' else 'X' end;
  x.winner := public.xo_check_winner(x.board);
  if x.winner = 'X' then x.wins_a := x.wins_a + 1; end if;
  if x.winner = 'O' then x.wins_b := x.wins_b + 1; end if;

  update public.pair_xo px
    set board = x.board, next_turn = x.next_turn, winner = x.winner,
        wins_a = x.wins_a, wins_b = x.wins_b, updated_at = now()
    where px.pair_id = pr.id;

  return query
    select px.board, px.next_turn, px.winner, px.wins_a, px.wins_b, px.updated_at
    from public.pair_xo px where px.pair_id = pr.id;
end;
$$;

create or replace function public.xo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  select id into pid from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if pid is null then
    raise exception 'You are not linked with anyone yet.';
  end if;
  update public.pair_xo px
    set board = '.........',
        next_turn = case when px.winner = 'X' then 'O' else 'X' end, -- loser starts
        winner = '', updated_at = now()
    where px.pair_id = pid;
end;
$$;

revoke all on function public.xo_move(integer) from public;
revoke all on function public.xo_reset() from public;
grant execute on function public.xo_move(integer) to authenticated;
grant execute on function public.xo_reset() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.pair_xo;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- snaps: the memories calendar -----------------------------------
-- A "snap" freezes the doodle page + that day's Daily dose of 💌 so the two
-- of you can scroll back through a calendar and reminisce.

create table if not exists public.pair_snaps (
  id         text primary key,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  author     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        text not null,                 -- YYYY-MM-DD (UTC)
  items      jsonb not null default '[]'::jsonb,
  question   text not null default '',
  answers    jsonb,                         -- [{author,text,reaction}] if revealed
  created_at timestamptz not null default now()
);
create index if not exists pair_snaps_pair_day_idx
  on public.pair_snaps (pair_id, day desc);
-- A ✨ Van Gogh repaint of the page, if one was made (PNG data URI).
alter table public.pair_snaps add column if not exists art text;

alter table public.pair_snaps enable row level security;
drop policy if exists snaps_select on public.pair_snaps;
create policy snaps_select on public.pair_snaps
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists snaps_insert on public.pair_snaps;
create policy snaps_insert on public.pair_snaps
  for insert with check (
    author = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists snaps_delete on public.pair_snaps;
create policy snaps_delete on public.pair_snaps
  for delete using (author = auth.uid());

-- ---------- hangman: removed ----------------------------------------------
-- The hangman game was retired. Re-running this schema cleans up any older
-- install (dropping the table also removes it from the realtime publication).
drop function if exists public.hangman_start(text);
drop function if exists public.hangman_guess(text);
drop table if exists public.pair_hangman;

-- ---------- rock paper scissors: pick in secret, reveal together -----------

create table if not exists public.pair_rps (
  pair_id     uuid primary key references public.pairs (id) on delete cascade,
  choice_a    text not null default '',
  choice_b    text not null default '',
  last_a      text not null default '',
  last_b      text not null default '',
  last_result text not null default '',   -- 'a' | 'b' | 'draw' | ''
  wins_a      integer not null default 0,
  wins_b      integer not null default 0,
  draws       integer not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.pair_rps enable row level security;
drop policy if exists rps_select on public.pair_rps;
create policy rps_select on public.pair_rps
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

create or replace function public.rps_play(choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.pairs%rowtype;
  r public.pair_rps%rowtype;
  c text := lower(trim(coalesce(choice, '')));
  beats boolean;
begin
  if c not in ('rock', 'paper', 'scissors') then
    raise exception 'Rock, paper, or scissors only.';
  end if;
  select * into pr from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if pr.id is null then
    raise exception 'You are not linked with anyone yet.';
  end if;
  insert into public.pair_rps (pair_id) values (pr.id)
    on conflict (pair_id) do nothing;
  select * into r from public.pair_rps px where px.pair_id = pr.id for update;

  if pr.user_a = auth.uid() then
    if r.choice_a <> '' then raise exception 'You already chose, waiting for them ♡'; end if;
    r.choice_a := c;
  else
    if r.choice_b <> '' then raise exception 'You already chose, waiting for them ♡'; end if;
    r.choice_b := c;
  end if;

  if r.choice_a <> '' and r.choice_b <> '' then
    r.last_a := r.choice_a;
    r.last_b := r.choice_b;
    if r.choice_a = r.choice_b then
      r.last_result := 'draw';
      r.draws := r.draws + 1;
    else
      beats := (r.choice_a = 'rock' and r.choice_b = 'scissors')
            or (r.choice_a = 'paper' and r.choice_b = 'rock')
            or (r.choice_a = 'scissors' and r.choice_b = 'paper');
      if beats then
        r.last_result := 'a';
        r.wins_a := r.wins_a + 1;
      else
        r.last_result := 'b';
        r.wins_b := r.wins_b + 1;
      end if;
    end if;
    r.choice_a := '';
    r.choice_b := '';
  end if;

  update public.pair_rps px
    set choice_a = r.choice_a, choice_b = r.choice_b, last_a = r.last_a,
        last_b = r.last_b, last_result = r.last_result, wins_a = r.wins_a,
        wins_b = r.wins_b, draws = r.draws, updated_at = now()
    where px.pair_id = pr.id;
end;
$$;

revoke all on function public.rps_play(text) from public;
grant execute on function public.rps_play(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.pair_rps;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- daily question: answer apart, reveal together -----------------
-- One question a day (picked client-side from a shared list). Each person
-- answers blind; the partner's answer only becomes readable AFTER you have
-- answered too (enforced here, not just in the app). After the reveal, each
-- person can attach one emoji reaction to the other's answer.

create table if not exists public.pair_answers (
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  day        text not null,
  author     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text       text not null,
  reaction   text not null default '',  -- MY reaction to THEIR answer that day
  created_at timestamptz not null default now(),
  primary key (pair_id, day, author)
);

-- security definer helper: RLS policies cannot subquery their own table
-- (infinite recursion), so the "have I answered today?" check lives here.
create or replace function public.has_answered(p_pair uuid, p_day text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pair_answers a
    where a.pair_id = p_pair and a.day = p_day and a.author = auth.uid()
  );
$$;
revoke all on function public.has_answered(uuid, text) from public;
grant execute on function public.has_answered(uuid, text) to authenticated;

alter table public.pair_answers enable row level security;

-- read own always; read partner's only after answering the same day (reveal)
drop policy if exists answers_select on public.pair_answers;
create policy answers_select on public.pair_answers
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
    and (author = auth.uid() or public.has_answered(pair_id, day))
  );
drop policy if exists answers_insert on public.pair_answers;
create policy answers_insert on public.pair_answers
  for insert with check (
    author = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
-- update own row only (the app only ever updates the reaction)
drop policy if exists answers_update on public.pair_answers;
create policy answers_update on public.pair_answers
  for update using (author = auth.uid()) with check (author = auth.uid());

alter table public.pair_answers replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.pair_answers;
exception
  when duplicate_object then null;
end;
$$;

-- ---------- self-serve account deletion -----------------------------------
-- Lets a signed-in user delete their own auth account (cascades to all rows).
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;

-- ---------- accountability: promises kept with real camera snaps ----------
-- Love should make you better, not sleepier. Each partner can add habits
-- ("promises") for either of the two. The owner proves a habit each day with
-- a photo taken in the app (camera only, never the gallery), or logs an
-- honest skip with a reason. Photo days grow the streak, a skip pauses it,
-- a silent miss breaks it (computed client-side from the proof rows).
-- The pact table stores the fingerprint-sealed promise.

create table if not exists public.pair_habits (
  id         text primary key,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  owner      uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null default auth.uid(),
  title      text not null,
  emoji      text not null default '🌱',
  remind_at  text not null default '',   -- 'HH:MM' on the owner's clock, '' = no reminder
  created_at timestamptz not null default now()
);
create index if not exists pair_habits_pair_idx
  on public.pair_habits (pair_id, created_at);

create table if not exists public.habit_proofs (
  id          text primary key,
  habit_id    text not null references public.pair_habits (id) on delete cascade,
  pair_id     uuid not null references public.pairs (id) on delete cascade,
  author      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         text not null,             -- YYYY-MM-DD (UTC), same clock as the tap game
  kind        text not null,
  photo       text,                      -- JPEG data URI straight from the camera
  caption     text not null default '',
  skip_reason text not null default '',
  reaction    text not null default '',  -- the partner's emoji on this proof
  created_at  timestamptz not null default now(),
  unique (habit_id, day)
);
create index if not exists habit_proofs_pair_day_idx
  on public.habit_proofs (pair_id, day desc);

-- Named, re-runnable check constraints: every existing check is dropped and
-- the canonical set re-added, so installs from any earlier shape of this
-- table converge on re-run. Note there is NO "photo required for kind=photo"
-- check here: it lives in the INSERT policy instead, because old rows have
-- their photo deliberately stripped (see trim_old_proof_photos below) while
-- the metadata keeps the streak.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.habit_proofs'::regclass and contype = 'c'
  loop
    execute format('alter table public.habit_proofs drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.habit_proofs
  add constraint habit_proofs_kind_check check (kind in ('photo', 'skip'));
alter table public.habit_proofs
  add constraint habit_proofs_skip_check check (kind <> 'skip' or length(trim(skip_reason)) > 0);
-- the proof photo is part of the trust story, so its shape is enforced here
-- too: a real image data URI, capped so no client can stuff the row
alter table public.habit_proofs
  add constraint habit_proofs_photo_check check (
    photo is null
    or (
      length(photo) < 4200000
      and (photo like 'data:image/jpeg;base64,%' or photo like 'data:image/png;base64,%')
    )
  );

-- Photos are for accountability, not archaeology: the metadata (day, kind,
-- caption, reason, reaction) keeps streaks and calendars forever, but the
-- heavy photo payload is stripped once a proof is 30 days old, so the
-- database stays small no matter how long the streaks run. Piggybacks on
-- inserts, so no cron job is needed.
create or replace function public.trim_old_proof_photos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.habit_proofs hp
    set photo = null
    where hp.pair_id = new.pair_id
      and hp.photo is not null
      and hp.day < to_char((now() at time zone 'utc') - interval '30 days', 'YYYY-MM-DD');
  return new;
end;
$$;
drop trigger if exists habit_proofs_trim on public.habit_proofs;
create trigger habit_proofs_trim
  after insert on public.habit_proofs
  for each row execute function public.trim_old_proof_photos();

-- The "become better for love" pact: each person seals it once with a long
-- fingerprint press in the app; the timestamps are the two signatures.
create table if not exists public.pair_pact (
  pair_id    uuid primary key references public.pairs (id) on delete cascade,
  signed_a   timestamptz,
  signed_b   timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pair_habits  enable row level security;
alter table public.habit_proofs enable row level security;
alter table public.pair_pact    enable row level security;

-- habits: both members see all of them; either member may add a habit for
-- either of the two (that is the accountability deal), and either member may
-- remove one. No updates: changing a promise means retiring it and making a
-- new one, in the open.
drop policy if exists habits_select on public.pair_habits;
create policy habits_select on public.pair_habits
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists habits_insert on public.pair_habits;
create policy habits_insert on public.pair_habits
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and (p.user_a = auth.uid() or p.user_b = auth.uid())
        and (owner = p.user_a or owner = p.user_b)
    )
  );
drop policy if exists habits_delete on public.pair_habits;
create policy habits_delete on public.pair_habits
  for delete using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

-- proofs: only the habit's owner logs them, only for TODAY (no backfilling a
-- prettier past), one per habit per day. The author may delete today's proof
-- (a retake); history is immutable for everyone. Reactions go through the
-- habit_react function so nothing else can be touched.
drop policy if exists proofs_select on public.habit_proofs;
create policy proofs_select on public.habit_proofs
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists proofs_insert on public.habit_proofs;
create policy proofs_insert on public.habit_proofs
  for insert with check (
    author = auth.uid()
    and day = to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    and (kind <> 'photo' or photo is not null)
    and exists (
      select 1
      from public.pair_habits h
      join public.pairs p on p.id = h.pair_id
      where h.id = habit_id
        and h.pair_id = habit_proofs.pair_id
        and h.owner = auth.uid()
        and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );
drop policy if exists proofs_delete on public.habit_proofs;
create policy proofs_delete on public.habit_proofs
  for delete using (
    author = auth.uid()
    and day = to_char(now() at time zone 'utc', 'YYYY-MM-DD')
  );

-- pact: members read it; signing only happens through pact_sign below.
drop policy if exists pact_select on public.pair_pact;
create policy pact_select on public.pair_pact
  for select using (
    exists (
      select 1 from public.pairs p
      where p.id = pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
    )
  );

-- React to the PARTNER's proof (mirrors note_react; reaction only).
create or replace function public.habit_react(proof_id text, emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.habit_proofs hp
    set reaction = left(coalesce(emoji, ''), 8)
    where hp.id = proof_id
      and hp.author <> auth.uid()
      and exists (
        select 1 from public.pairs p
        where p.id = hp.pair_id and (p.user_a = auth.uid() or p.user_b = auth.uid())
      );
end;
$$;

-- Sign the pact with my long fingerprint press. Signing is one-way: once a
-- side is signed it stays signed.
create or replace function public.pact_sign()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.pairs%rowtype;
begin
  select * into pr from public.pairs
    where user_a = auth.uid() or user_b = auth.uid()
    limit 1;
  if pr.id is null then
    raise exception 'You are not linked with anyone yet.';
  end if;
  if pr.user_b is null then
    raise exception 'The pact needs both of you. Share your invite code first.';
  end if;
  insert into public.pair_pact (pair_id) values (pr.id)
    on conflict (pair_id) do nothing;
  if pr.user_a = auth.uid() then
    update public.pair_pact
      set signed_a = coalesce(signed_a, now()), updated_at = now()
      where pair_id = pr.id;
  else
    update public.pair_pact
      set signed_b = coalesce(signed_b, now()), updated_at = now()
      where pair_id = pr.id;
  end if;
end;
$$;

revoke all on function public.habit_react(text, text) from public;
revoke all on function public.pact_sign() from public;
grant execute on function public.habit_react(text, text) to authenticated;
grant execute on function public.pact_sign() to authenticated;

-- No realtime publication for these tables on purpose: proof rows can carry
-- megabyte photo payloads, which realtime would try to ship whole. The app
-- keeps them fresh with its quiet poll instead.
