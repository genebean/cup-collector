import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { searchPlaces } from "@/lib/places";

// Proxy route for Google Places API (New) — location-biased Text Search.
// The API key NEVER leaves the server — it is read from the environment here
// and is not included in any response sent to the browser.
//
// Usage: GET /api/nearby-starbucks?lat=37.77&lng=-122.41&radius=16093
// Returns: { stores: Array of { name, address, lat, lng, place_id } }
// radius is in meters (16093 ≈ 10 miles) — Google's locationBias API requires meters.
//
// All results Google returns are passed through. locationBias is a hint so Google
// may include stores slightly outside the radius; those appear on the map when the
// user pans to them, which is the desired behaviour. maxResultCount is the real
// quota guard.

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

  const stores = await searchPlaces({
    textQuery: "Starbucks",
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
        radius: radiusMeters,
      },
    },
  });

  return NextResponse.json({ stores });
}
