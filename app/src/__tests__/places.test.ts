import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPlaces } from "@/lib/places";

describe("searchPlaces", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    savedApiKey = process.env.GOOGLE_PLACES_API_KEY;
  });

  afterEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = savedApiKey;
    vi.restoreAllMocks();
  });

  it("returns empty array when API key is not set", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const result = await searchPlaces({ textQuery: "Starbucks" });
    expect(result).toEqual([]);
  });

  it("returns normalized stores from a successful response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "place_1",
            displayName: { text: "Starbucks Nashville" },
            formattedAddress: "100 Broadway, Nashville, TN 37201, USA",
            location: { latitude: 36.162, longitude: -86.781 },
          },
        ],
      }),
    }));

    const result = await searchPlaces({ textQuery: "Starbucks in Nashville TN" });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "Starbucks Nashville",
      address: "100 Broadway, Nashville, TN 37201, USA",
      lat: 36.162,
      lng: -86.781,
      place_id: "place_1",
    });
  });

  it("falls back to 'Starbucks' when displayName is missing", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "place_2",
            displayName: null,
            formattedAddress: "Somewhere",
            location: { latitude: 0, longitude: 0 },
          },
        ],
      }),
    }));

    const result = await searchPlaces({ textQuery: "Starbucks" });
    expect(result[0].name).toBe("Starbucks");
  });

  it("returns empty array when places is absent in the response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    const result = await searchPlaces({ textQuery: "Starbucks" });
    expect(result).toEqual([]);
  });

  it("returns empty array on non-ok HTTP response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    }));

    const result = await searchPlaces({ textQuery: "Starbucks" });
    expect(result).toEqual([]);
  });

  it("returns empty array when fetch throws", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await searchPlaces({ textQuery: "Starbucks" });
    expect(result).toEqual([]);
  });
});
