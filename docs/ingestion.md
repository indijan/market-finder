# Ingestion MVP (pseudo)

## Sources
- Google Places: text/nearby search for "farmers market", "night market", "marketplace" across NZ regions.
- OSM Overpass: amenity=marketplace within bounding boxes.
- Optional iCal/ICS feeds for event schedules.

## Pipeline outline
1. Fetch raw records per source into `market_sources` with full payload JSON.
2. Normalize into `markets` fields (name, location, address, website, rating, photo refs).
3. Deduplicate by proximity + name similarity (trigram + distance threshold).
4. Enrich:
   - cover photo url from Places photo_reference
   - AI: is_market, market_type, short_description, confidence
   - schedule extraction into `market_events`
5. Update `last_verified_at` and source `last_fetched_at`.

## Minimal cron cadence
- Daily run (Supabase cron / Edge Function) with region sharding.

## Dedup idea
- Match by `ST_DWithin` 50m and trigram similarity > 0.8 on name.

## AI enrichment (optional)
- Classifier: market vs non-market
- Type: farmers/night/craft/flea/other
- Short description: 1-2 sentences
- Confidence score

## Admin endpoints
- `POST /api/admin/ingest/run` triggers ingestion job
- `POST /api/admin/ai/enrich` triggers enrichment job
