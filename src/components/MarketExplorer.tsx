"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketSummary } from "@/lib/types";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView").then((mod) => mod.MapView), {
  ssr: false,
});

const DEFAULT_CENTER = { lat: -36.8485, lng: 174.7633 };
const isValidNzCenter = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat <= -34 &&
  lat >= -47 &&
  lng >= 166 &&
  lng <= 179;

const formatDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatDistance = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "";
  if (value < 1) return "<1 km";
  return `${value.toFixed(1)} km`;
};

const formatStars = (rating: number | null) => {
  if (!rating || rating <= 0) return "";
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return "*".repeat(filled).padEnd(5, ".");
};

export const MarketExplorer = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastUrlRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(25);
  const [rangeDays, setRangeDays] = useState(30);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const [includeStores, setIncludeStores] = useState(false);
  const [marketTypes, setMarketTypes] = useState<string[]>([
    "farmers",
    "night",
    "craft",
    "flea",
    "other",
  ]);
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [suggestions, setSuggestions] = useState<
    {
      id: string;
      name: string;
      city: string | null;
      region: string | null;
      address: string | null;
      lat?: number;
      lng?: number;
    }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geocodeQuery = async (value: string) => {
    if (!value.trim()) return;
    try {
      const response = await fetch(`/api/markets/locate?q=${encodeURIComponent(value.trim())}`);
      if (!response.ok) return;
      const payload = await response.json();
      const match = payload?.match;
      if (match?.lat && match?.lng) {
        setCenter({ lat: match.lat, lng: match.lng });
      }
    } catch (err) {
      setError("Unable to locate the query. Try a different location.");
    }
  };

  const handleSuggestionSelect = (item: {
    name: string;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    lat?: number;
    lng?: number;
  }) => {
    setQuery(item.name);
    if (typeof item.lat === "number" && typeof item.lng === "number") {
      setCenter({ lat: item.lat, lng: item.lng });
    } else {
      const fallbackQuery = [item.name, item.address, item.city, item.region]
        .filter(Boolean)
        .join(", ");
      void geocodeQuery(fallbackQuery);
    }
    setShowSuggestions(false);
  };

  const dateRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + rangeDays);
    return { start, end };
  }, [rangeDays]);

  const effectiveCenter = useMemo(() => {
    if (isValidNzCenter(center.lat, center.lng)) {
      return center;
    }
    return DEFAULT_CENTER;
  }, [center]);

  const currentQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("lat", String(effectiveCenter.lat));
    params.set("lng", String(effectiveCenter.lng));
    params.set("radiusKm", String(radiusKm));
    params.set("rangeDays", String(rangeDays));
    params.set("dateFilter", dateFilterEnabled ? "1" : "0");
    params.set("includeStores", includeStores ? "1" : "0");
    if (marketTypes.length > 0) {
      params.set("marketTypes", marketTypes.join(","));
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return params.toString();
  }, [
    effectiveCenter.lat,
    effectiveCenter.lng,
    radiusKm,
    rangeDays,
    dateFilterEnabled,
    includeStores,
    marketTypes,
    query,
  ]);

  useEffect(() => {
    if (!searchParams) return;
    const latParam = Number(searchParams.get("lat"));
    const lngParam = Number(searchParams.get("lng"));
    if (isValidNzCenter(latParam, lngParam)) {
      setCenter({ lat: latParam, lng: lngParam });
    }

    const radiusParam = Number(searchParams.get("radiusKm"));
    if (Number.isFinite(radiusParam) && radiusParam > 0) {
      setRadiusKm(Math.min(Math.max(radiusParam, 1), 100));
    }

    const daysParam = Number(searchParams.get("rangeDays"));
    if (Number.isFinite(daysParam) && daysParam > 0) {
      setRangeDays(Math.min(Math.max(daysParam, 1), 60));
    }

    const qParam = searchParams.get("q");
    if (qParam) {
      setQuery(qParam);
    }

    const dateEnabled = searchParams.get("dateFilter") === "1";
    setDateFilterEnabled(dateEnabled);

    const includeStoresParam = searchParams.get("includeStores") === "1";
    setIncludeStores(includeStoresParam);

    const typesParam = searchParams.get("marketTypes");
    if (typesParam) {
      const parsedTypes = typesParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (parsedTypes.length > 0) {
        setMarketTypes(parsedTypes);
      }
    }
    initializedRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!initializedRef.current) return;
    const nextUrl = `/?${currentQuery}`;
    if (lastUrlRef.current === nextUrl) {
      return;
    }
    const handle = setTimeout(() => {
      lastUrlRef.current = nextUrl;
      router.replace(nextUrl, { scroll: false });
    }, 300);

    return () => clearTimeout(handle);
  }, [currentQuery, router, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({
        lat: String(effectiveCenter.lat),
        lng: String(effectiveCenter.lng),
        radiusKm: String(radiusKm),
      });
      if (dateFilterEnabled) {
        params.set("dateFrom", dateRange.start.toISOString());
        params.set("dateTo", dateRange.end.toISOString());
      }
      if (includeStores) {
        params.set("includeStores", "1");
      }
      if (marketTypes.length > 0) {
        params.set("marketTypes", marketTypes.join(","));
      }
      if (query.trim()) {
        params.set("q", query.trim());
      }

      try {
        const response = await fetch(`/api/markets?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "Failed to load markets");
        }
        const payload = await response.json();
        setMarkets(payload.markets || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(load, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    effectiveCenter,
    radiusKm,
    rangeDays,
    query,
    dateRange.end,
    dateRange.start,
    dateFilterEnabled,
    includeStores,
    marketTypes,
  ]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query.trim(),
        });
        if (includeStores) {
          params.set("includeStores", "1");
        }
        const response = await fetch(`/api/markets/suggest?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        setSuggestions(payload.suggestions || []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [query, includeStores]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Location access denied. Allow location in the browser.");
          return;
        }
        if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setError("Location unavailable. Try again or use a different network.");
          return;
        }
        if (geoError.code === geoError.TIMEOUT) {
          setError("Location request timed out. Try again.");
          return;
        }
        setError("Unable to fetch your location.");
      }
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1.6fr]">
      <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl shadow-black/20 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Filters</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Find markets nearby</h2>
        </div>
        <div className="space-y-4">
          <label className="block text-sm text-slate-100">
            Search
            <div className="relative mt-2">
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void geocodeQuery(query);
                    setShowSuggestions(false);
                  }
                }}
                placeholder="Name, address, suburb"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-300/60"
              />
              {showSuggestions && suggestions.length > 0 ? (
                <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/95 p-2 text-sm text-slate-100 shadow-2xl shadow-black/40 backdrop-blur">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSuggestionSelect(item);
                      }}
                      onClick={() => handleSuggestionSelect(item)}
                      className="flex w-full flex-col gap-1 rounded-xl px-3 py-2 text-left hover:bg-white/5"
                    >
                      <span className="text-sm text-white">{item.name}</span>
                      <span className="text-xs text-slate-300/70">
                        {[item.address, item.city, item.region].filter(Boolean).join(" • ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
          <label className="block text-sm text-slate-100">
            Radius: <span className="font-semibold text-amber-200">{radiusKm} km</span>
            <input
              type="range"
              min={1}
              max={100}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <label className="block text-sm text-slate-100">
            Date range: <span className="font-semibold text-amber-200">today -&gt; +{rangeDays} days</span>
            <input
              type="range"
              min={1}
              max={30}
              value={rangeDays}
              onChange={(event) => setRangeDays(Number(event.target.value))}
              className="mt-2 w-full"
              disabled={!dateFilterEnabled}
            />
          </label>
          <div className="space-y-2">
            <div className="text-sm text-slate-100">Market types</div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-200/80">
              {["farmers", "night", "craft", "flea", "other"].map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={marketTypes.includes(type)}
                    onChange={(event) => {
                      setMarketTypes((prev) =>
                        event.target.checked
                          ? [...prev, type]
                          : prev.filter((value) => value !== type)
                      );
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-white/5"
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-100">
            <input
              type="checkbox"
              checked={includeStores}
              onChange={(event) => setIncludeStores(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            Include stores (non-markets)
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-100">
            <input
              type="checkbox"
              checked={dateFilterEnabled}
              onChange={(event) => setDateFilterEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            Enable date filter
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUseLocation}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:border-amber-200 hover:text-amber-200"
            >
              Use my location
            </button>
            <button
              type="button"
              onClick={() => {
                setCenter(DEFAULT_CENTER);
                setRadiusKm(25);
                setRangeDays(30);
                setDateFilterEnabled(false);
                setQuery("");
                setIncludeStores(false);
                setMarketTypes(["farmers", "night", "craft", "flea", "other"]);
              }}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-amber-200 hover:text-amber-200"
            >
              Reset filters
            </button>
            <div className="text-xs text-slate-200/80">
              Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200/70">
          {isLoading ? "Loading markets..." : `${markets.length} markets found`}
          {error ? ` - ${error}` : ""}
        </div>
      </section>

      <section className="space-y-5">
        <div className="relative h-[360px] overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="absolute left-6 top-6 z-10 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/80 backdrop-blur">
            Live map
          </div>
          <MapView
            center={effectiveCenter}
            markets={markets}
            radiusKm={radiusKm}
            onCenterChange={setCenter}
            returnTo={`/?${currentQuery}`}
          />
        </div>

        <div className="grid gap-4">
          {markets.map((market) => (
            <article
              key={market.id}
              className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/10 md:flex-row"
            >
              <div className="h-32 w-full overflow-hidden rounded-2xl bg-white/10 md:h-28 md:w-40">
                {market.cover_photo_url ? (
                  <img
                    src={market.cover_photo_url}
                    alt={market.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-200/60">
                    No photo
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-200/80">
                  <span>{market.market_type || "market"}</span>
                  <span>-</span>
                  <span>{formatDistance(market.distance_km)}</span>
                  {market.rating ? (
                    <>
                      <span>-</span>
                      <span>{formatStars(market.rating)} {market.rating.toFixed(1)}</span>
                    </>
                  ) : null}
                </div>
                <h4 className="text-xl font-semibold text-white">
                  <a
                    href={`/markets/${market.id}?return=${encodeURIComponent(`/?${currentQuery}`)}`}
                    className="hover:text-amber-200"
                  >
                    {market.name}
                  </a>
                </h4>
                <p className="text-sm text-slate-100/80">
                  {market.short_description || "Fresh finds, local food, and community vibes."}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/70">
                  <span>{market.city || market.region || ""}</span>
                  {market.next_event_at ? (
                    <span>Next: {formatDate(market.next_event_at)}</span>
                  ) : (
                    <span>No upcoming date</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
