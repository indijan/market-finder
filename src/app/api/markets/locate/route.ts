import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const GET = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const includeStores = searchParams.get("includeStores") === "1";

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query too short." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("find_market_location", {
    p_q: q,
    p_include_stores: includeStores,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const match = data?.[0];
  if (!match) {
    return NextResponse.json({ match: null });
  }

  return NextResponse.json({
    match: {
      id: match.id,
      name: match.name,
      address: match.address,
      city: match.city,
      region: match.region,
      lat: match.lat,
      lng: match.lng,
      similarity: match.similarity,
    },
  });
};
