import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";

// Proxy route for Google Places API (New) — Text Search.
// The API key NEVER leaves the server — it is read from the environment here
// and is not included in any response sent to the browser.
//
// Usage: GET /api/nearby-starbucks?lat=37.77&lng=-122.41&radius=16093
// Returns: { stores: Array of { name, address, lat, lng, place_id } }
// radius is in meters (16093 ≈ 10 miles)

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = parseFloat(searchParams.get("radius") || "16093");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json({ stores: [] });
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: "Starbucks",
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
              radius,
            },
          },
        }),
        // Cache results for 10 minutes — store locations don't change often
        next: { revalidate: 600 },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Google Places API error:", response.status, body);
      return NextResponse.json({ stores: [] });
    }

    const data = await response.json();

    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    const stores = (data.places ?? [])
      .map((place: {
        id: string;
        displayName: { text: string };
        formattedAddress: string;
        location: { latitude: number; longitude: number };
      }) => ({
        name: place.displayName?.text ?? "Starbucks",
        address: place.formattedAddress ?? "",
        lat: place.location.latitude,
        lng: place.location.longitude,
        place_id: place.id,
      }))
      // Google's locationBias is a hint, not a hard limit — filter to the actual radius
      .filter((s: { lat: number; lng: number }) =>
        haversineMeters(centerLat, centerLng, s.lat, s.lng) <= radius
      );

    return NextResponse.json({ stores });
  } catch (err) {
    console.error("Failed to fetch from Google Places:", err);
    return NextResponse.json({ stores: [] });
  }
}
