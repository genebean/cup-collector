import { describe, it, expect } from "vitest";
import { parseCSV, rowMatchesExisting } from "@/lib/cup-import";

const HEADER = "city,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes";

describe("parseCSV", () => {
  it("parses a single data row", () => {
    const csv = [HEADER, "Seattle,Washington,United States,US,Been There,2018,47.6062,-122.3321,,,https://starbucks-mugs.com/mug/been-there-seattle/,"].join("\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      city: "Seattle",
      region: "Washington",
      country: "United States",
      country_code: "US",
      series: "Been There",
      year: 2018,
      lat: 47.6062,
      lng: -122.3321,
      image_url: "",
      hobbydb_url: "",
      more_info_url: "https://starbucks-mugs.com/mug/been-there-seattle/",
      notes: "",
    });
  });

  it("skips rows missing required fields", () => {
    const csv = [HEADER, ",Washington,United States,US,Been There,2018,0,0,,,," ].join("\n");
    expect(parseCSV(csv)).toHaveLength(0);
  });

  it("skips blank lines", () => {
    const csv = [HEADER, "", "Seattle,WA,United States,US,Been There,2018,47.6,-122.3,,,," , ""].join("\n");
    expect(parseCSV(csv)).toHaveLength(1);
  });

  it("defaults missing optional columns to empty string", () => {
    const csv = [HEADER, "Tokyo,,,JP,You Are Here,2013,35.6762,139.6503,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.region).toBe("");
    expect(row.country).toBe("");
    expect(row.image_url).toBe("");
  });

  it("parses image_url, hobbydb_url, and more_info_url when present", () => {
    const csv = [
      HEADER,
      "Seattle,Washington,United States,US,Been There,2018,47.6062,-122.3321,https://example.com/img.jpg,https://hobbydb.com/x,https://starbucks-mugs.com/mug/y/,A note",
    ].join("\n");
    const [row] = parseCSV(csv);
    expect(row.image_url).toBe("https://example.com/img.jpg");
    expect(row.hobbydb_url).toBe("https://hobbydb.com/x");
    expect(row.more_info_url).toBe("https://starbucks-mugs.com/mug/y/");
    expect(row.notes).toBe("A note");
  });
});

describe("rowMatchesExisting", () => {
  const base = {
    city: "Seattle", region: "Washington", country: "United States",
    country_code: "US", series: "Been There", year: 2018,
    lat: 47.6062, lng: -122.3321, image_url: "", hobbydb_url: "", more_info_url: "", notes: "",
  };
  const existing = {
    id: "abc123",
    region: "Washington", country: "United States", country_code: "US",
    lat: 47.6062, lng: -122.3321,
    image_credit: "", hobbydb_url: "", more_info_url: "", notes: "",
  };

  it("returns true when all fields match", () => {
    expect(rowMatchesExisting(base, existing)).toBe(true);
  });

  it("returns false when region differs", () => {
    expect(rowMatchesExisting({ ...base, region: "Oregon" }, existing)).toBe(false);
  });

  it("returns false when image_url differs from image_credit", () => {
    expect(rowMatchesExisting({ ...base, image_url: "https://example.com/new.jpg" }, existing)).toBe(false);
  });

  it("returns false when more_info_url differs", () => {
    expect(rowMatchesExisting({ ...base, more_info_url: "https://starbucks-mugs.com/mug/x/" }, existing)).toBe(false);
  });

  it("treats null/undefined existing fields as empty string", () => {
    expect(rowMatchesExisting(base, { ...existing, hobbydb_url: null })).toBe(true);
    expect(rowMatchesExisting(base, { ...existing, notes: undefined })).toBe(true);
  });

  it("returns true when image_url matches image_credit", () => {
    const url = "https://example.com/img.jpg";
    expect(rowMatchesExisting({ ...base, image_url: url }, { ...existing, image_credit: url })).toBe(true);
  });
});
