import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { searchPlaces } from "@/lib/places";
import { haversineMi } from "@/lib/geo";
import type { NearbyStore } from "@/types";

// Proxy route for Google Places API (New) — location-biased Text Search.
// The API key NEVER leaves the server — it is read from the environment here
// and is not included in any response sent to the browser.
//
// Usage: GET /api/nearby-starbucks?lat=37.77&lng=-122.41&radius=16093
// Returns: { stores: Array of { name, address, lat, lng, place_id } }
// radius is in meters (16093 ≈ 10 miles) — Google's locationBias API requires meters.

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radiusMeters = parseFloat(searchParams.get("radius") || "16093");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const centerLat = parseFloat(lat);
  const centerLng = parseFloat(lng);
  // Convert meters to miles for haversineMi — Google's API requires meters but
  // our distance library works in miles to stay consistent with the rest of the codebase.
  const radiusMi = radiusMeters / 1609.344;

  const allStores = await searchPlaces({
    textQuery: "Starbucks",
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: centerLat, longitude: centerLng },
        radius: radiusMeters,
      },
    },
  });

  // Google's locationBias is a hint, not a hard limit — filter to the actual radius
  const stores = allStores.filter((s: NearbyStore) =>
    haversineMi({ lat: centerLat, lng: centerLng }, { lat: s.lat, lng: s.lng }) <= radiusMi
  );

  return NextResponse.json({ stores });
}
