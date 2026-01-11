-- Dedupe helpers for markets
-- 1) Create merge function (moves child rows, hides duplicate market)

create or replace function merge_markets(keep_id uuid, drop_id uuid)
returns void
language plpgsql
as $$
begin
  -- Move sources/photos/events to keep_id
  update market_sources set market_id = keep_id where market_id = drop_id;
  update market_photos set market_id = keep_id where market_id = drop_id;
  update market_events set market_id = keep_id where market_id = drop_id;

  -- Hide duplicate market (safer than delete)
  update markets set is_published = false where id = drop_id;
end;
$$;

-- 2) Report likely duplicates (distance + name similarity)
-- Adjust thresholds if needed.

select
  m1.id as keep_id,
  m1.name as keep_name,
  m2.id as drop_id,
  m2.name as drop_name,
  round(st_distance(m1.location, m2.location)::numeric, 1) as distance_m,
  round(similarity(m1.name, m2.name)::numeric, 3) as name_similarity
from markets m1
join markets m2
  on m1.id < m2.id
where m1.is_published = true
  and m2.is_published = true
  and st_dwithin(m1.location, m2.location, 75)
  and similarity(m1.name, m2.name) >= 0.85
order by name_similarity desc, distance_m asc;

-- 3) Merge selected pairs (example)
-- select merge_markets('keep-uuid', 'drop-uuid');
