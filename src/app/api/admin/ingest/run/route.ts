import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type GooglePlace = {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  photos?: { photo_reference: string }[];
  types?: string[];
};


const REGIONS = [
  { name: "Auckland", lat: -36.8485, lng: 174.7633, radius: 50000 },
  { name: "Matakana", lat: -36.3562, lng: 174.7094, radius: 30000 },
  { name: "Hamilton", lat: -37.7870, lng: 175.2793, radius: 35000 },
  { name: "Tauranga", lat: -37.6878, lng: 176.1651, radius: 35000 },
  { name: "Rotorua", lat: -38.1368, lng: 176.2497, radius: 30000 },
  { name: "Taupo", lat: -38.6857, lng: 176.0702, radius: 30000 },
  { name: "Napier", lat: -39.4928, lng: 176.9120, radius: 30000 },
  { name: "New Plymouth", lat: -39.0556, lng: 174.0752, radius: 30000 },
  { name: "Palmerston North", lat: -40.3564, lng: 175.6092, radius: 30000 },
  { name: "Nelson", lat: -41.2706, lng: 173.2840, radius: 30000 },
  { name: "Wellington", lat: -41.2865, lng: 174.7762, radius: 40000 },
  { name: "Christchurch", lat: -43.5321, lng: 172.6362, radius: 40000 },
  { name: "Queenstown", lat: -45.0312, lng: 168.6626, radius: 30000 },
  { name: "Dunedin", lat: -45.8788, lng: 170.5028, radius: 30000 },
];

const KEYWORDS = ["farmers market", "night market", "marketplace", "craft market"];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchGooglePlaces = async (
  apiKey: string,
  region: { lat: number; lng: number; radius: number },
  keyword: string
) => {
  const results: GooglePlace[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 2; page += 1) {
    const params = new URLSearchParams({
      key: apiKey,
      location: `${region.lat},${region.lng}`,
      radius: String(region.radius),
      keyword,
      type: "point_of_interest",
    });
    if (pageToken) {
      params.set("pagetoken", pageToken);
      await delay(2000);
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
    );
    if (!response.ok) {
      throw new Error(`Google Places error: ${response.status}`);
    }
    const payload = await response.json();
    if (payload.results) {
      results.push(...payload.results);
    }
    pageToken = payload.next_page_token ?? null;
    if (!pageToken) break;
  }

  return results;
};

const isSupermarketPlace = (place: GooglePlace) => {
  const types = place.types || [];
  if (types.includes("supermarket") || types.includes("grocery_or_supermarket")) {
    return true;
  }
  const name = place.name.toLowerCase();
  return name.includes("supermarket") || name.includes("super market");
};

const NAME_EXCLUDES = [
  "store",
  "cafe",
  "bar",
  "office",
  "truck",
  "gallery",
  "kmart",
  "deal",
  "mall",
  "dealonline",
  "asaving",
  "cart",
  "kai",
  "cars",
  "wharf",
  "fishing",
  "tackle",
  "warehouse",
  "garden",
  "nursery",
  "marketplace",
  "supermarket",
];

const TYPE_EXCLUDES = ["restaurant"];

const isExcludedByName = (place: GooglePlace) => {
  const name = place.name.toLowerCase();
  return NAME_EXCLUDES.some((token) => name.includes(token));
};

const isMarketByName = (place: GooglePlace) => {
  const name = place.name.toLowerCase();
  return name.includes("market");
};

const isExcludedByType = (place: GooglePlace) => {
  const types = place.types || [];
  return types.some((type) => TYPE_EXCLUDES.includes(type));
};

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const fetchOverpassMarkets = async (endpoint: string) => {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="marketplace"](-47.5,166.0,-34.0,178.8);
      way["amenity"="marketplace"](-47.5,166.0,-34.0,178.8);
      relation["amenity"="marketplace"](-47.5,166.0,-34.0,178.8);
    );
    out center;
  `;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass error: ${response.status}`);
  }

  const payload = await response.json();
  return (payload.elements || []) as OverpassElement[];
};

const authorize = (request: NextRequest) => {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    return "ADMIN_API_TOKEN is not set";
  }
  const header = request.headers.get("x-admin-token");
  if (!header || header !== token) {
    return "Unauthorized";
  }
  return null;
};

export const POST = async (request: NextRequest) => {
  const authError = authorize(request);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "both";
  const maxPlaces = Math.max(Number(searchParams.get("maxPlaces") || "0"), 0);
  const googlePlacesEnabled = process.env.GOOGLE_PLACES_ENABLED === "true";

  const supabase = createSupabaseAdminClient();
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const overpassEndpoint =
    process.env.OVERPASS_ENDPOINT || "https://overpass-api.de/api/interpreter";

  if ((source === "google" || source === "both") && !googlePlacesEnabled) {
    return NextResponse.json(
      { error: "Google Places ingestion is disabled." },
      { status: 410 }
    );
  }

  const ingested: { source: string; count: number }[] = [];

  if (source === "google" || source === "both") {
    if (!googleApiKey) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY is not set" },
        { status: 400 }
      );
    }
    const apiKey = googleApiKey;
    for (const region of REGIONS) {
      for (const keyword of KEYWORDS) {
        const places = await fetchGooglePlaces(apiKey, region, keyword);
        const limitedPlaces = maxPlaces > 0 ? places.slice(0, maxPlaces) : places;
        let linkedCount = 0;
        for (const place of limitedPlaces) {
          const location = place.geometry?.location;
          if (!location) continue;

          const isMarket =
            isMarketByName(place) &&
            !isSupermarketPlace(place) &&
            !isExcludedByName(place) &&
            !isExcludedByType(place);

          if (!isMarket) {
            continue;
          }

          const { data: matchId } = await supabase.rpc("find_market_match", {
            p_name: place.name,
            p_lat: location.lat,
            p_lng: location.lng,
            p_distance_meters: 120,
          });

          if (!matchId) {
            continue;
          }

          await supabase
            .from("market_sources")
            .upsert(
              {
                market_id: matchId,
                source: "google",
                source_id: place.place_id,
                payload: null,
                last_fetched_at: new Date().toISOString(),
              },
              { onConflict: "source,source_id" }
            );
          linkedCount += 1;
        }
        ingested.push({
          source: `google:${region.name}:${keyword}`,
          count: linkedCount,
        });
        await delay(200);
      }
    }
  }

  if (source === "osm" || source === "both") {
    const osmElements = await fetchOverpassMarkets(overpassEndpoint);
    for (const element of osmElements) {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (lat === undefined || lng === undefined) continue;

      const name = element.tags?.name || "Marketplace";
      const { data: matchId } = await supabase.rpc("find_market_match", {
        p_name: name,
        p_lat: lat,
        p_lng: lng,
        p_distance_meters: 75,
      });

      if (matchId) {
        await supabase
          .from("market_sources")
          .upsert(
            {
              market_id: matchId,
              source: "osm",
              source_id: String(element.id),
              payload: element,
              last_fetched_at: new Date().toISOString(),
            },
            { onConflict: "source,source_id" }
          );
        continue;
      }

    await supabase.rpc("upsert_market_from_source", {
      p_source: "osm",
      p_source_id: String(element.id),
      p_payload: element,
      p_name: name,
      p_slug: slugify(name),
      p_lat: lat,
      p_lng: lng,
      p_address: null,
      p_city: element.tags?.["addr:city"] ?? null,
      p_region: element.tags?.["addr:state"] ?? null,
      p_postcode: element.tags?.["addr:postcode"] ?? null,
      p_country: "NZ",
      p_website: element.tags?.website ?? null,
      p_phone: element.tags?.phone ?? null,
      p_rating: null,
      p_rating_count: null,
      p_price_level: null,
      p_editorial_summary: null,
      p_opening_hours_text: null,
      p_opening_hours_json: null,
      p_wheelchair_accessible_entrance: null,
      p_wheelchair_accessible_parking: null,
      p_wheelchair_accessible_restroom: null,
      p_wheelchair_accessible_seating: null,
      p_google_reviews: null,
      p_is_market: true,
      p_cover_photo_url: null,
      p_market_type: "other",
    });
    }
    ingested.push({ source: "osm", count: osmElements.length });
  }

  return NextResponse.json({
    status: "done",
    ingested,
  });
};
