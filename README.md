# ClueMart (MVP)

Map and filter New Zealand markets using Next.js + Supabase (PostGIS). This MVP includes:

- Map + list UI with radius/date/search filters
- Supabase schema + seed data
- `/api/markets` + `/api/markets/:id` endpoints
- Admin placeholders for ingestion and AI enrichment

## Setup

1) Install deps

```bash
npm install
```

2) Add env vars

```bash
cp .env.example .env.local
```

3) Create schema and seed in Supabase

- Run `supabase/schema.sql` in the SQL editor
- Optional seed data: `supabase/seed.sql`

4) Start the app

```bash
npm run dev
```

Open http://localhost:3000

## API

- `GET /api/markets?lat=-36.8485&lng=174.7633&radiusKm=25&dateFrom=2025-01-01&dateTo=2025-02-01&q=night`
- `GET /api/markets/:id`
- `POST /api/admin/ingest/run` (requires `x-admin-token` header)
- `POST /api/admin/ai/enrich` (requires `x-admin-token` header)

## Notes

- `search_markets` function drives radius + date filtering.
- Google Places ingestion is disabled unless `GOOGLE_PLACES_ENABLED=true`.
- Google Places ingest now only links `place_id` to existing markets and does not store Places details.
- Run `purge_google_places_cache()` in Supabase on a schedule (e.g. daily) to enforce Places data TTL.
- Replace the map placeholder with Mapbox/Leaflet when ready.
- Ingestion pseudocode: `docs/ingestion.md`
