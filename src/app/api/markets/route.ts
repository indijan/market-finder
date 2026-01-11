import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const parseNumber = (value: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const GET = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);

  const lat = parseNumber(searchParams.get("lat"));
  const lng = parseNumber(searchParams.get("lng"));
  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  const radiusKm = parseNumber(searchParams.get("radiusKm")) ?? 25;
  const q = searchParams.get("q")?.trim() || null;
  const includeStores = searchParams.get("includeStores") === "1";
  const marketTypesRaw = searchParams.get("marketTypes");
  const marketTypes = marketTypesRaw
    ? marketTypesRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;
  const dateFromRaw = searchParams.get("dateFrom");
  const dateToRaw = searchParams.get("dateTo");
  const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
  const dateTo = dateToRaw ? new Date(dateToRaw) : null;
  const limit = Math.min(
    Math.max(parseNumber(searchParams.get("limit")) ?? 200, 1),
    500
  );

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.rpc("search_markets", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: Math.min(Math.max(radiusKm, 1), 100),
    p_date_from: dateFrom && !Number.isNaN(dateFrom.valueOf()) ? dateFrom.toISOString() : null,
    p_date_to: dateTo && !Number.isNaN(dateTo.valueOf()) ? dateTo.toISOString() : null,
    p_q: q && q.length > 0 ? q : null,
    p_limit: limit,
    p_include_stores: includeStores,
    p_market_types: marketTypes,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    markets: data ?? [],
  });
};
