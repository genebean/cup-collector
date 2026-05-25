import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";

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
          textQuery: `Starbucks in ${q}`,
          maxResultCount: 20,
        }),
        next: { revalidate: 600 },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Google Places API error:", response.status, body);
      return NextResponse.json({ stores: [] });
    }

    const data = await response.json();

    const stores = (data.places ?? []).map((place: {
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
    }));

    return NextResponse.json({ stores });
  } catch (err) {
    console.error("Failed to fetch from Google Places:", err);
    return NextResponse.json({ stores: [] });
  }
}
