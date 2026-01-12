-- Supabase schema for ClueMart MVP (markets + events + sources + photos)

create extension if not exists "pgcrypto";
create extension if not exists "postgis";
create extension if not exists "pg_trgm";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'market_type') then
    create type market_type as enum ('farmers', 'night', 'craft', 'flea', 'other');
  end if;
end
$$;

create table if not exists raw_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  payload jsonb not null,
  location geography(Point, 4326),
  fetched_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  location geography(Point, 4326) not null,
  address text,
  city text,
  region text,
  postcode text,
  country text default 'NZ',
  short_description text,
  market_type market_type default 'other',
  is_market boolean default true,
  website text,
  phone text,
  rating numeric(3,2),
  rating_count int,
  price_level int,
  editorial_summary text,
  opening_hours_text text[],
  opening_hours_json jsonb,
  wheelchair_accessible_entrance boolean,
  wheelchair_accessible_parking boolean,
  wheelchair_accessible_restroom boolean,
  wheelchair_accessible_seating boolean,
  google_reviews jsonb,
  cover_photo_url text,
  source_priority text,
  last_verified_at timestamptz,
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(region, '')
    )
  ) stored
);

create table if not exists market_sources (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete cascade,
  source text not null,
  source_id text not null,
  payload jsonb,
  last_fetched_at timestamptz,
  created_at timestamptz default now(),
  unique (source, source_id)
);

create table if not exists market_photos (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete cascade,
  source text not null,
  source_ref text,
  attribution jsonb,
  cached_storage_path text,
  width int,
  height int,
  created_at timestamptz default now()
);

create table if not exists market_events (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  recurrence_rule text,
  source text,
  last_verified_at timestamptz,
  created_at timestamptz default now()
);

alter table markets
  add column if not exists price_level int,
  add column if not exists editorial_summary text,
  add column if not exists opening_hours_text text[],
  add column if not exists opening_hours_json jsonb,
  add column if not exists wheelchair_accessible_entrance boolean,
  add column if not exists wheelchair_accessible_parking boolean,
  add column if not exists wheelchair_accessible_restroom boolean,
  add column if not exists wheelchair_accessible_seating boolean,
  add column if not exists google_reviews jsonb,
  add column if not exists is_market boolean;

create index if not exists markets_location_gix on markets using gist (location);
create index if not exists markets_search_gin on markets using gin (search_vector);
create index if not exists markets_city_trgm on markets using gin (city gin_trgm_ops);
create index if not exists market_events_market_start_idx on market_events (market_id, start_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'markets_set_updated_at'
  ) then
    create trigger markets_set_updated_at
    before update on markets
    for each row execute procedure set_updated_at();
  end if;
end
$$;

-- Search + radius + optional date filtering
create or replace function search_markets(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_q text default null,
  p_limit int default 200,
  p_include_stores boolean default false,
  p_market_types text[] default null
)
returns table (
  id uuid,
  name text,
  slug text,
  address text,
  city text,
  region text,
  country text,
  short_description text,
  market_type market_type,
  website text,
  phone text,
  rating numeric,
  rating_count int,
  cover_photo_url text,
  last_verified_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision,
  next_event_at timestamptz,
  has_google_source boolean
)
language sql
stable
as $$
  with base as (
    select
      m.*,
      st_distance(m.location, st_makepoint(p_lng, p_lat)::geography) as distance_m
    from markets m
    where m.is_published = true
      and st_dwithin(m.location, st_makepoint(p_lng, p_lat)::geography, p_radius_km * 1000)
      and (p_q is null or m.search_vector @@ websearch_to_tsquery('simple', p_q))
      and (p_include_stores = true or m.is_market = true)
      and (p_market_types is null or m.market_type::text = any (p_market_types))
  )
  select
    b.id,
    b.name,
    b.slug,
    b.address,
    b.city,
    b.region,
    b.country,
    b.short_description,
    b.market_type,
    b.website,
    b.phone,
    b.rating,
    b.rating_count,
    b.cover_photo_url,
    b.last_verified_at as last_verified_at,
    st_y(b.location::geometry) as lat,
    st_x(b.location::geometry) as lng,
    (b.distance_m / 1000.0) as distance_km,
    e.next_event_at,
    exists (
      select 1
      from market_sources ms
      where ms.market_id = b.id
        and ms.source = 'google'
    ) as has_google_source
  from base b
  left join lateral (
    select min(me.start_at) as next_event_at
    from market_events me
    where me.market_id = b.id
      and (p_date_from is null or me.start_at >= p_date_from)
      and (p_date_to is null or me.start_at <= p_date_to)
  ) e on true
  where (p_date_from is null and p_date_to is null) or e.next_event_at is not null
  order by distance_km asc, e.next_event_at asc nulls last
  limit p_limit;
$$;

create or replace function find_market_location(
  p_q text,
  p_include_stores boolean default false
)
returns table (
  id uuid,
  name text,
  address text,
  city text,
  region text,
  lat double precision,
  lng double precision,
  similarity double precision
)
language sql
stable
as $$
  with ranked as (
    select
      m.id,
      m.name,
      m.address,
      m.city,
      m.region,
      st_y(m.location::geometry) as lat,
      st_x(m.location::geometry) as lng,
      greatest(
        similarity(coalesce(m.name, ''), p_q),
        similarity(coalesce(m.address, ''), p_q),
        similarity(coalesce(m.city, ''), p_q),
        similarity(coalesce(m.region, ''), p_q)
      ) as similarity
    from markets m
    where m.is_published = true
      and (p_include_stores = true or m.is_market = true)
      and (
        m.name % p_q
        or m.address % p_q
        or m.city % p_q
        or m.region % p_q
      )
  )
  select *
  from ranked
  order by similarity desc, name asc
  limit 1;
$$;

create or replace function upsert_market_from_source(
  p_source text,
  p_source_id text,
  p_payload jsonb,
  p_name text,
  p_slug text,
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_city text,
  p_region text,
  p_postcode text,
  p_country text,
  p_website text,
  p_phone text,
  p_rating numeric,
  p_rating_count int,
  p_price_level int,
  p_editorial_summary text,
  p_opening_hours_text text[],
  p_opening_hours_json jsonb,
  p_wheelchair_accessible_entrance boolean,
  p_wheelchair_accessible_parking boolean,
  p_wheelchair_accessible_restroom boolean,
  p_wheelchair_accessible_seating boolean,
  p_google_reviews jsonb,
  p_is_market boolean,
  p_cover_photo_url text,
  p_market_type market_type
)
returns uuid
language plpgsql
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  select market_id
    into existing_id
  from market_sources
  where source = p_source
    and source_id = p_source_id;

  if existing_id is null then
    insert into markets (
      name,
      slug,
      location,
      address,
      city,
      region,
      postcode,
      country,
      website,
      phone,
      rating,
      rating_count,
      price_level,
      editorial_summary,
      opening_hours_text,
      opening_hours_json,
      wheelchair_accessible_entrance,
      wheelchair_accessible_parking,
      wheelchair_accessible_restroom,
      wheelchair_accessible_seating,
      google_reviews,
      is_market,
      cover_photo_url,
      source_priority,
      last_verified_at,
      market_type
    ) values (
      p_name,
      p_slug,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_address,
      p_city,
      p_region,
      p_postcode,
      coalesce(p_country, 'NZ'),
      p_website,
      p_phone,
      p_rating,
      p_rating_count,
      p_price_level,
      p_editorial_summary,
      p_opening_hours_text,
      p_opening_hours_json,
      p_wheelchair_accessible_entrance,
      p_wheelchair_accessible_parking,
      p_wheelchair_accessible_restroom,
      p_wheelchair_accessible_seating,
      p_google_reviews,
      coalesce(p_is_market, true),
      p_cover_photo_url,
      p_source,
      now(),
      p_market_type
    )
    returning id into new_id;

    insert into market_sources (
      market_id,
      source,
      source_id,
      payload,
      last_fetched_at
    ) values (
      new_id,
      p_source,
      p_source_id,
      p_payload,
      now()
    );

    return new_id;
  end if;

  update markets
    set
      name = coalesce(p_name, name),
      slug = coalesce(p_slug, slug),
      address = coalesce(p_address, address),
      city = coalesce(p_city, city),
      region = coalesce(p_region, region),
      postcode = coalesce(p_postcode, postcode),
      country = coalesce(p_country, country),
      website = coalesce(p_website, website),
      phone = coalesce(p_phone, phone),
      rating = coalesce(p_rating, rating),
      rating_count = coalesce(p_rating_count, rating_count),
      price_level = coalesce(p_price_level, price_level),
      editorial_summary = coalesce(p_editorial_summary, editorial_summary),
      opening_hours_text = coalesce(p_opening_hours_text, opening_hours_text),
      opening_hours_json = coalesce(p_opening_hours_json, opening_hours_json),
      wheelchair_accessible_entrance = coalesce(p_wheelchair_accessible_entrance, wheelchair_accessible_entrance),
      wheelchair_accessible_parking = coalesce(p_wheelchair_accessible_parking, wheelchair_accessible_parking),
      wheelchair_accessible_restroom = coalesce(p_wheelchair_accessible_restroom, wheelchair_accessible_restroom),
      wheelchair_accessible_seating = coalesce(p_wheelchair_accessible_seating, wheelchair_accessible_seating),
      google_reviews = coalesce(p_google_reviews, google_reviews),
      is_market = coalesce(p_is_market, is_market),
      cover_photo_url = coalesce(p_cover_photo_url, cover_photo_url),
      market_type = coalesce(p_market_type, market_type),
      last_verified_at = now()
  where id = existing_id;

  update market_sources
    set
      payload = p_payload,
      last_fetched_at = now()
  where source = p_source
    and source_id = p_source_id;

  return existing_id;
end;
$$;

create or replace function find_market_match(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_distance_meters double precision default 75
)
returns uuid
language sql
stable
as $$
  select m.id
  from markets m
  where st_dwithin(
    m.location,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_distance_meters
  )
  order by similarity(m.name, p_name) desc
  limit 1;
$$;

create or replace function purge_google_places_cache(
  p_max_age interval default '30 days'
)
returns void
language plpgsql
as $$
begin
  update markets
    set
      rating = null,
      rating_count = null,
      price_level = null,
      editorial_summary = null,
      opening_hours_text = null,
      opening_hours_json = null,
      wheelchair_accessible_entrance = null,
      wheelchair_accessible_parking = null,
      wheelchair_accessible_restroom = null,
      wheelchair_accessible_seating = null,
      google_reviews = null,
      cover_photo_url = null
  where exists (
    select 1
    from market_sources ms
    where ms.market_id = markets.id
      and ms.source = 'google'
      and ms.last_fetched_at < now() - p_max_age
  );

  update market_sources
    set payload = null
  where source = 'google'
    and last_fetched_at < now() - p_max_age;

  delete from markets
  where source_priority = 'google'
    and created_at < now() - p_max_age;
end;
$$;

-- RLS (optional; enable if desired)
-- alter table markets enable row level security;
-- alter table market_events enable row level security;
-- create policy "public read markets" on markets for select using (is_published = true);
-- create policy "public read events" on market_events for select using (
--   exists (select 1 from markets m where m.id = market_events.market_id and m.is_published = true)
-- );
