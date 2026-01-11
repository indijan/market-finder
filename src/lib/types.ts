export type MarketSummary = {
  id: string;
  name: string;
  slug: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  short_description: string | null;
  market_type: string | null;
  is_market?: boolean | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  rating_count: number | null;
  cover_photo_url: string | null;
  last_verified_at: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  next_event_at: string | null;
};

export type MarketPhoto = {
  id: string;
  source: string;
  source_ref: string | null;
  attribution: unknown;
  cached_storage_path: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

export type MarketEvent = {
  id: string;
  start_at: string;
  end_at: string | null;
  recurrence_rule: string | null;
  source: string | null;
  last_verified_at: string | null;
  created_at: string;
};

export type MarketDetail = {
  id: string;
  name: string;
  slug: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  short_description: string | null;
  market_type: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  editorial_summary: string | null;
  opening_hours_text: string[] | null;
  wheelchair_accessible_entrance: boolean | null;
  wheelchair_accessible_parking: boolean | null;
  wheelchair_accessible_restroom: boolean | null;
  wheelchair_accessible_seating: boolean | null;
  google_reviews: unknown;
  cover_photo_url: string | null;
  last_verified_at: string | null;
  market_photos: MarketPhoto[];
  market_events: MarketEvent[];
};
