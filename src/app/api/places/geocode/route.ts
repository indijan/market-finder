import { NextResponse } from "next/server";

export const GET = async () =>
  NextResponse.json(
    {
      error:
        "Geocoding is disabled. Use /api/markets/locate for DB-based matching or enable Places explicitly.",
    },
    { status: 410 }
  );
