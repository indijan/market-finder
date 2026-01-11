import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const GET = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const includeStores = searchParams.get("includeStores") === "1";

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabase = createSupabaseServerClient();
  const query = supabase
    .from("markets")
    .select("id, name, city, region, address")
    .eq("is_published", true)
    .or(`name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,region.ilike.%${q}%`)
    .order("rating_count", { ascending: false })
    .limit(8);

  if (!includeStores) {
    query.eq("is_market", true);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions: data ?? [] });
};
