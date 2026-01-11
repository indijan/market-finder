import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const GET = async (
  _request: NextRequest,
  context: { params: { id: string } }
) => {
  const { id } = context.params;
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("markets")
    .select(
      `
        id,
        name,
        slug,
        address,
        city,
        region,
        postcode,
        country,
        short_description,
        market_type,
        website,
        phone,
        rating,
        rating_count,
        cover_photo_url,
        last_verified_at,
        market_photos (
          id,
          source,
          source_ref,
          attribution,
          cached_storage_path,
          width,
          height,
          created_at
        ),
        market_events (
          id,
          start_at,
          end_at,
          recurrence_rule,
          source,
          last_verified_at,
          created_at
        )
      `
    )
    .eq("id", id)
    .eq("is_published", true)
    .order("start_at", { ascending: true, referencedTable: "market_events" })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ market: data });
};
