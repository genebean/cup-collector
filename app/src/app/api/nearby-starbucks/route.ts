import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";

// Proxy route for Google Places Nearby Search.
// The API key NEVER leaves the server — it is read from the environment here
// and is not included in any response sent to the browser.
//
// Usage: GET /api/nearby-starbucks?lat=37.77&lng=-122.41&radius=2000
// Returns: Array of { name, address, lat, lng, place_id }

export async function GET(request: NextRequest) {
  // Require authentication — only logged-in users can trigger Places lookups
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") || "2000"; // Default 2km radius

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng query parameters are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return NextResponse.json(
      { error: "Places API is not configured" },
      { status: 503 }
    );
  }

  const placesUrl =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}` +
    `&radius=${radius}` +
    `&keyword=starbucks` +
    `&type=cafe` +
    `&key=${apiKey}`;

  try {
    const response = await fetch(placesUrl, {
      // Cache results for 10 minutes — Starbucks locations don't change often
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      console.error("Google Places API error:", response.status);
      return NextResponse.json(
        { error: "Places API request failed" },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Google Places API returned status:", data.status);
      return NextResponse.json({ stores: [] });
    }

    // Transform the Places API response into a simpler shape.
    // We only expose what the UI needs — never forward the raw Places response.
    const stores = (data.results || []).map(
      (place: {
        name: string;
        vicinity: string;
        geometry: { location: { lat: number; lng: number } };
        place_id: string;
      }) => ({
        name: place.name,
        address: place.vicinity,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        place_id: place.place_id,
      })
    );

    return NextResponse.json({ stores });
  } catch (err) {
    console.error("Failed to fetch from Google Places:", err);
    return NextResponse.json(
      { error: "Failed to reach Places API" },
      { status: 502 }
    );
  }
}
