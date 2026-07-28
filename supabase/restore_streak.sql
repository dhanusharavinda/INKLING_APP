-- ===========================================================================
-- One-off streak repair for Dhanush + Delisha.
--
-- Why this is needed: the 🛟 lifeguard column was added to an ALREADY running
-- 25-day streak. A new column starts at 0, so the saves earned back on day 10
-- and day 20 never existed in the bank, and the first missed day reset the
-- streak to zero. schema.sql now backfills earned lifeguards so this cannot
-- happen again; this file gives back the days that were already lost.
--
-- Run it in the Supabase SQL editor AFTER re-running schema.sql.
-- ===========================================================================

-- STEP 1: look at what is there now (note the code of your pair).
select p.code,
       p.name_a,
       p.name_b,
       g.streak          as streak_now,
       g.lifeguards      as lifeguards_now,
       g.last_streak_day,
       g.day             as taps_day,
       g.taps            as taps_today
from public.pair_game g
join public.pairs p on p.id = g.pair_id;

-- STEP 2: give the 28 days back (25 lost + the 3 rebuilt), with the two
-- lifeguards a 28-day streak has earned (day 10 and day 20).
--
-- last_streak_day is deliberately left alone: it already says whether today's
-- 100 taps are banked, so tomorrow simply continues from 28 -> 29.
update public.pair_game g
set streak = 28,
    lifeguards = 2,
    lifeguards_backfilled = true,
    updated_at = now()
from public.pairs p
where p.id = g.pair_id
  and p.code = 'B9757E';   -- Dhanush + Delisha

-- STEP 3: confirm it took (streak 28, lifeguards 2).
select p.code, g.streak, g.lifeguards, g.last_streak_day
from public.pair_game g
join public.pairs p on p.id = g.pair_id;
