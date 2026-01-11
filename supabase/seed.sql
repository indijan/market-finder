insert into markets (
  id, name, slug, location, address, city, region, postcode, short_description,
  market_type, website, rating, rating_count, cover_photo_url, source_priority, last_verified_at
) values
(
  gen_random_uuid(),
  'Auckland Night Market',
  'auckland-night-market',
  st_makepoint(174.7633, -36.8485)::geography,
  'Queen St, Auckland CBD',
  'Auckland',
  'Auckland',
  '1010',
  'A lively night market with street food and local crafts every weekend.',
  'night',
  'https://example.com/auckland-night-market',
  4.4,
  512,
  'https://images.example.com/auckland-night.jpg',
  'google',
  now()
),
(
  gen_random_uuid(),
  'Wellington Harbourside Market',
  'wellington-harbourside-market',
  st_makepoint(174.7787, -41.2905)::geography,
  'Harbourside Market, Te Papa, Cable St',
  'Wellington',
  'Wellington',
  '6011',
  'Fresh produce, artisan food, and live music by the waterfront.',
  'farmers',
  'https://example.com/wellington-market',
  4.6,
  338,
  'https://images.example.com/wellington-harbour.jpg',
  'google',
  now()
);

insert into market_events (market_id, start_at, end_at, source, last_verified_at)
select id, now() + interval '2 days', now() + interval '2 days' + interval '4 hours', 'manual', now()
from markets where slug = 'auckland-night-market';

insert into market_events (market_id, start_at, end_at, source, last_verified_at)
select id, now() + interval '5 days', now() + interval '5 days' + interval '4 hours', 'manual', now()
from markets where slug = 'wellington-harbourside-market';
