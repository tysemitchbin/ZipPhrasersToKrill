-- ===========================================================================
--  TEST SEED - fake players + ~2 weeks of scores so the whole site renders.
--  Run in the Supabase dashboard: SQL Editor -> paste -> Run.
--  Safe to re-run. Scroll to the bottom for the one-line teardown.
--  Every test row is namespaced `test_*` so teardown can't touch real data.
-- ===========================================================================

insert into players (id, display_name) values
  ('test_tessa', 'Tessa (test)'),
  ('test_rob',   'Rob (test)'),
  ('test_kai',   'Kai (test)'),
  ('test_mona',  'Mona (test)'),
  ('test_gus',   'Gus (test)'),
  ('test_wren',  'Wren (test)')
on conflict (id) do nothing;

-- deterministic pseudo-random 0..(n-1) from a seed string
create or replace function _testrng(seed text, n int) returns int
  language sql immutable as
$$ select ((hashtext(seed) % n) + n) % n $$;

-- 13 days x 6 games x 6 players, with ~15% of (player, game, day) rows dropped
-- so turnout varies (some games miss the 4-player cutoff, streaks differ).
insert into scores (game_id, player_id, play_date, raw_score, source)
select
  game,
  player,
  d::date,
  case game
    when 'wordle'   then 2 + _testrng(game||player||d::text, 5)        -- 2..6 guesses
    when 'krillion' then 60 + _testrng(game||player||d::text, 340)     -- 60..399, higher wins
    else                 25 + _testrng(game||player||d::text, 275)     -- 25..299 seconds
  end,
  'manual'
from generate_series('2026-08-29'::date, '2026-09-10'::date, interval '1 day') d
cross join unnest(array['wordle','zip','queens','tango','krillion','crossclimb']) game
cross join unnest(array['test_tessa','test_rob','test_kai','test_mona','test_gus','test_wren']) player
where _testrng(game||player||d::text||'skip', 100) >= 15
on conflict (game_id, player_id, play_date) do nothing;

-- one bonus row of each kind, so the Bonus Points table + feed populate
insert into bonus_points (player_id, play_date, amount, label, source) values
  ('test_wren', '2026-09-07', 5, '🔥 7-day streak',            'streak'),
  ('test_gus',  '2026-09-09', 3, '✅ Full sweep (5 games)',     'completion'),
  ('test_mona', '2026-09-09', 2, '🎰 🐢 Green Shell',           'roulette'),
  ('test_kai',  '2026-09-10', 7, '🎰x2 🍄 Mushroom + 🐚 Blue Shell', 'roulette'),
  ('test_rob',  '2026-09-10', 3, '🪞 Milestone: 121',           'milestone')
on conflict (player_id, play_date, source) do nothing;

drop function _testrng(text, int);

-- ===========================================================================
--  TEARDOWN - run this block on its own before inviting real users.
--  Deleting the players cascades to their scores / bonus / streak rows.
-- ===========================================================================
-- delete from players where id like 'test\_%';
