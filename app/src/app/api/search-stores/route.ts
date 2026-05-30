import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { searchPlaces } from "@/lib/places";

// Proxy route for Google Places API (New) — Text Search for Starbucks by location name.
// The API key NEVER leaves the server.
//
// Usage: GET /api/search-stores?q=Nashville+TN
// Returns: { stores: Array of { name, address, lat, lng, place_id } }

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "q query parameter is required" }, { status: 400 });
  }

  const stores = await searchPlaces({ textQuery: `Starbucks in ${q}`, maxResultCount: 20 });
  return NextResponse.json({ stores });
}
