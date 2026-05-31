import type { NearbyStore } from "@/types";

// Shared Google Places API (New) client.
// Called from route handlers only — the API key stays server-side.
// See /api/nearby-starbucks and /api/search-stores for usage.

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location";

// Raw shape returned by Google Places API for each place in the response.
interface GooglePlace {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
}

function toStore(place: GooglePlace): NearbyStore {
  return {
    name: place.displayName?.text ?? "Starbucks",
    address: place.formattedAddress ?? "",
    lat: place.location.latitude,
    lng: place.location.longitude,
    place_id: place.id,
  };
}

/**
 * Calls the Google Places Text Search API and returns normalized store records.
 * Returns an empty array on any error rather than throwing — callers log and
 * surface a safe empty state rather than a 500.
 *
 * @param requestBody - The Places API request body (textQuery, locationBias, etc.)
 */
export async function searchPlaces(requestBody: object): Promise<NearbyStore[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY is not set");
    return [];
  }

  try {
    const response = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
      // Cache results for 10 minutes — store locations don't change often
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Google Places API error:", response.status, body);
      return [];
    }

    const data = await response.json() as { places?: GooglePlace[] };
    return (data.places ?? []).map(toStore);
  } catch (err) {
    console.error("Failed to fetch from Google Places:", err);
    return [];
  }
}
