import type { MarketDetail } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatStars = (rating: number | null) => {
  if (!rating || rating <= 0) return "";
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return "*".repeat(filled).padEnd(5, ".");
};

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { id } = await params;
  const { return: returnParam } = await searchParams;
  const returnTo = returnParam && returnParam.startsWith("/") ? returnParam : "/";
  const supabase = createSupabaseAdminClient();
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
        price_level,
        editorial_summary,
        opening_hours_text,
        wheelchair_accessible_entrance,
        wheelchair_accessible_parking,
        wheelchair_accessible_restroom,
        wheelchair_accessible_seating,
        google_reviews,
        cover_photo_url,
        last_verified_at,
        market_sources (
          source,
          source_id
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold">Market not found</h1>
          <p className="mt-3 text-slate-200/70">Check the ID or go back to the map.</p>
          <a className="mt-6 inline-flex text-sm text-amber-200" href={returnTo}>
            &lt;- Back to map
          </a>
        </div>
      </div>
    );
  }
  const market = data as MarketDetail & {
    market_sources?: { source: string; source_id: string }[];
  };
  const googleSource = market.market_sources?.find((source) => source.source === "google");
  const mapsUrl = googleSource?.source_id
    ? `https://www.google.com/maps/place/?q=place_id:${googleSource.source_id}`
    : market.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(market.address)}`
    : null;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto grid max-w-5xl gap-8">
        <a
          className="text-xs uppercase tracking-[0.35em] text-amber-200/70"
          href={returnTo}
        >
          Back to map
        </a>
        <section className="rounded-[32px] border border-white/10 bg-white/5 p-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                {market.market_type || "market"}
              </div>
              <h1 className="text-3xl font-semibold md:text-4xl">{market.name}</h1>
              <p className="text-base text-slate-100/80">
                {market.short_description || "Local market with fresh produce and community energy."}
              </p>
                <div className="flex flex-wrap gap-3 text-sm text-slate-200/70">
                  <span>{market.address}</span>
                  {market.city ? <span>- {market.city}</span> : null}
                  {market.region ? <span>- {market.region}</span> : null}
                </div>
                {market.rating ? (
                  <div className="text-sm text-amber-200">
                    {formatStars(market.rating)} {market.rating.toFixed(1)}
                    {market.rating_count ? ` (${market.rating_count})` : ""}
                  </div>
                ) : null}
              <div className="flex flex-wrap gap-4 text-sm text-amber-200">
                {market.website ? (
                  <a href={market.website} target="_blank" rel="noreferrer">
                    Website
                  </a>
                ) : null}
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noreferrer">
                    Open in Maps
                  </a>
                ) : null}
              </div>
              {googleSource ? (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-200/80">
                  Powered by Google Places.
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200/80">
                <div className="flex flex-wrap gap-3">
                  {market.rating ? <span>Rating: {market.rating}</span> : null}
                  {market.rating_count ? <span>({market.rating_count} reviews)</span> : null}
                  {market.price_level !== null && market.price_level !== undefined ? (
                    <span>Price level: {market.price_level}</span>
                  ) : null}
                </div>
                {market.editorial_summary ? (
                  <p className="mt-2 text-sm text-slate-100/80">{market.editorial_summary}</p>
                ) : null}
                {market.opening_hours_text?.length ? (
                  <div className="mt-3 space-y-1">
                    {market.opening_hours_text.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                ) : null}
                {(market.wheelchair_accessible_entrance ||
                  market.wheelchair_accessible_parking ||
                  market.wheelchair_accessible_restroom ||
                  market.wheelchair_accessible_seating) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-200/80">
                    {market.wheelchair_accessible_entrance ? <span>Accessible entrance</span> : null}
                    {market.wheelchair_accessible_parking ? <span>Accessible parking</span> : null}
                    {market.wheelchair_accessible_restroom ? <span>Accessible restroom</span> : null}
                    {market.wheelchair_accessible_seating ? <span>Accessible seating</span> : null}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10">
              {market.cover_photo_url ? (
                <img
                  src={market.cover_photo_url}
                  alt={market.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-slate-200/70">
                  Cover photo unavailable
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Upcoming dates</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-200/80">
              {market.market_events?.length ? (
                market.market_events.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <span>{formatDateTime(event.start_at)}</span>
                    {event.end_at ? <span>-&gt; {formatDateTime(event.end_at)}</span> : null}
                    <span className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
                      {event.source || "source"}
                    </span>
                  </div>
                ))
              ) : (
                <div>
                  <p>No upcoming events logged yet.</p>
                  {market.opening_hours_text?.length ? (
                    <div className="mt-3 space-y-1 text-xs text-slate-200/70">
                      {market.opening_hours_text.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
