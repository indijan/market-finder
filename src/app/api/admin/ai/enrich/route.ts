import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const normalizeTimeInput = (input: string) =>
  input
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u202f/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseTime = (input: string) => {
  const normalized = normalizeTimeInput(input);
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();
  const normalizedHours = meridiem
    ? meridiem === "pm"
      ? (hours % 12) + 12
      : hours % 12
    : Math.min(Math.max(hours, 0), 23);
  return { hours: normalizedHours, minutes };
};

const parseDurationHours = (timeRaw: string) => {
  const normalized = normalizeTimeInput(timeRaw);
  if (normalized.toLowerCase().includes("24 hours")) return 24;
  const parts = normalized.split(/-|–/).map((part) => part.trim());
  if (parts.length < 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (!start || !end) return null;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const duration = endMinutes - startMinutes;
  if (duration <= 0) return null;
  return duration / 60;
};

const isLikelyStoreByHours = (weekdayText?: string[]) => {
  if (!weekdayText || weekdayText.length < 7) return false;
  let openDays = 0;
  let longDayCount = 0;
  for (const line of weekdayText) {
    const normalized = normalizeTimeInput(line);
    const parts = normalized.split(":").map((part) => part.trim());
    if (parts.length < 2) continue;
    const timeRaw = parts.slice(1).join(":");
    if (timeRaw.toLowerCase() === "closed") continue;
    openDays += 1;
    const duration = parseDurationHours(timeRaw);
    if (duration !== null && duration >= 8) {
      longDayCount += 1;
    }
  }
  return openDays >= 5 && longDayCount >= 5;
};

const nextOccurrence = (weekday: number, hours: number, minutes: number) => {
  const now = new Date();
  const candidate = new Date(now);
  const diff = (weekday - now.getDay() + 7) % 7;
  candidate.setDate(now.getDate() + diff);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
};

const parseWeekdayLine = (line: string) => {
  const normalized = normalizeTimeInput(line);
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex === -1) return null;
  const dayRaw = normalized.slice(0, separatorIndex).trim();
  const timeRaw = normalized.slice(separatorIndex + 1).trim();
  const dayKey = dayRaw?.toLowerCase();
  if (!dayKey || !(dayKey in WEEKDAY_MAP)) return null;
  if (!timeRaw || timeRaw.toLowerCase() === "closed") return null;
  if (timeRaw.toLowerCase().includes("24 hours")) {
    return {
      weekday: WEEKDAY_MAP[dayKey],
      startTime: { hours: 0, minutes: 0 },
      endTime: { hours: 23, minutes: 59 },
    };
  }

  const times = timeRaw.split(/-|–/).map((part) => part.trim());
  const startTime = parseTime(times[0]);
  const endTime = times[1] ? parseTime(times[1]) : null;
  if (!startTime) return null;

  return {
    weekday: WEEKDAY_MAP[dayKey],
    startTime,
    endTime,
  };
};

export const POST = async (request: NextRequest) => {
  const authError = authorize(request);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || "50"), 1), 500);
  const windowDays = Math.min(Math.max(Number(searchParams.get("windowDays") || "30"), 7), 60);
  const weekendOnly = (searchParams.get("weekendOnly") || "1") !== "0";

  const supabase = createSupabaseAdminClient();

  const { data: markets, error } = await supabase
    .from("markets")
    .select("id, opening_hours_text, is_market")
    .not("opening_hours_text", "is", null)
    .eq("is_market", true)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fallbackToSources = !markets || markets.length === 0;
  const sourceLookup = fallbackToSources
    ? await supabase
        .from("market_sources")
        .select("market_id, payload")
        .eq("source", "google")
        .limit(limit)
    : null;

  if (fallbackToSources && sourceLookup?.error) {
    return NextResponse.json({ error: sourceLookup.error.message }, { status: 500 });
  }

  let created = 0;
  let marketsWithHours = 0;
  let marketsWithOccurrences = 0;
  let totalOccurrences = 0;
  const records = fallbackToSources
    ? (sourceLookup?.data || []).map((source) => {
        const openingHours = (source.payload as { details?: { opening_hours?: { weekday_text?: string[] } } })
          ?.details?.opening_hours;
        return {
          id: source.market_id,
          opening_hours_text: openingHours?.weekday_text ?? null,
          is_market: true,
        };
      })
    : markets ?? [];

  for (const market of records) {
    const weekdayText = (market as { opening_hours_text: string[] | null }).opening_hours_text;
    if (!weekdayText || weekdayText.length === 0) continue;
    marketsWithHours += 1;
    if (isLikelyStoreByHours(weekdayText)) {
      await supabase
        .from("markets")
        .update({ is_market: false })
        .eq("id", market.id);
      await supabase
        .from("market_events")
        .delete()
        .eq("market_id", market.id)
        .eq("source", "opening_hours");
      continue;
    }

    const windowStart = new Date();
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    await supabase
      .from("market_events")
      .delete()
      .eq("market_id", market.id)
      .eq("source", "opening_hours")
      .gte("start_at", windowStart.toISOString())
      .lte("start_at", windowEnd.toISOString());

    const occurrences: { start: Date; end: Date | null; byDay: string }[] = [];
    for (const line of weekdayText) {
      const parsed = parseWeekdayLine(line);
      if (!parsed) continue;
      if (weekendOnly && parsed.weekday !== 0 && parsed.weekday !== 6) continue;
      let cursor = nextOccurrence(
        parsed.weekday,
        parsed.startTime.hours,
        parsed.startTime.minutes
      );
      while (cursor <= windowEnd) {
        const end = parsed.endTime
          ? (() => {
              const endCandidate = new Date(cursor);
              endCandidate.setHours(parsed.endTime.hours, parsed.endTime.minutes, 0, 0);
              if (endCandidate <= cursor) {
                endCandidate.setDate(endCandidate.getDate() + 1);
              }
              return endCandidate;
            })()
          : null;
        occurrences.push({
          start: new Date(cursor),
          end: end ? new Date(end) : null,
          byDay: ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][parsed.weekday],
        });
        cursor.setDate(cursor.getDate() + 7);
      }
    }

    if (occurrences.length === 0) continue;
    marketsWithOccurrences += 1;
    totalOccurrences += occurrences.length;

    const { error: insertError } = await supabase.from("market_events").insert(
      occurrences.map((occurrence) => ({
        market_id: market.id,
        start_at: occurrence.start.toISOString(),
        end_at: occurrence.end ? occurrence.end.toISOString() : null,
        source: "opening_hours",
        recurrence_rule: `FREQ=WEEKLY;BYDAY=${occurrence.byDay}`,
        last_verified_at: new Date().toISOString(),
      }))
    );

    if (!insertError) {
      created += occurrences.length;
    }
  }

  return NextResponse.json({
    status: "done",
    processed: markets?.length ?? 0,
    events_created: created,
    markets_with_hours: marketsWithHours,
    markets_with_occurrences: marketsWithOccurrences,
    occurrences_total: totalOccurrences,
  });
};
