import { describe, it, expect } from "vitest";
import { parseCSV, rowMatchesExisting } from "@/lib/cup-import";

const HEADER_NEW = "name,scope,venue_series,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes";
const HEADER_OLD = "city,region,country,country_code,series,year,lat,lng,image_url,hobbydb_url,more_info_url,notes";

describe("parseCSV", () => {
  it("parses a single data row (new name/scope columns)", () => {
    const csv = [HEADER_NEW, "Seattle,city,,Washington,United States,US,Been There,2018,47.6062,-122.3321,,,https://starbucks-mugs.com/mug/been-there-seattle/,"].join("\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Seattle",
      scope: "city",
      venue_series: "",
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

  it("parses old-style CSVs with 'city' column (backward compatibility)", () => {
    const csv = [HEADER_OLD, "Seattle,Washington,United States,US,Been There,2018,47.6062,-122.3321,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.name).toBe("Seattle");
    expect(row.scope).toBe("city"); // default when no scope column
  });

  it("defaults scope to 'city' when scope column is absent", () => {
    const csv = [HEADER_OLD, "Tokyo,,,JP,You Are Here,2013,35.6762,139.6503,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.scope).toBe("city");
  });

  it("parses state and country scope", () => {
    const csv = [HEADER_NEW, "Georgia,state,,GA,United States,US,Been There,2022,32.1656,-82.9001,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.name).toBe("Georgia");
    expect(row.scope).toBe("state");
  });

  it("parses themed scope with venue_series", () => {
    const csv = [HEADER_NEW, "Wakanda,themed,Been There Disney Parks,,,,Been There Marvel,2021,0,0,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.name).toBe("Wakanda");
    expect(row.scope).toBe("themed");
    expect(row.venue_series).toBe("Been There Disney Parks");
  });

  it("skips rows missing required fields", () => {
    const csv = [HEADER_NEW, ",city,,Washington,United States,US,Been There,2018,0,0,,,," ].join("\n");
    expect(parseCSV(csv)).toHaveLength(0);
  });

  it("skips blank lines", () => {
    const csv = [HEADER_NEW, "", "Seattle,city,,WA,United States,US,Been There,2018,47.6,-122.3,,,," , ""].join("\n");
    expect(parseCSV(csv)).toHaveLength(1);
  });

  it("defaults missing optional columns to empty string", () => {
    const csv = [HEADER_NEW, "Tokyo,city,,,,JP,You Are Here,2013,35.6762,139.6503,,,,"].join("\n");
    const [row] = parseCSV(csv);
    expect(row.region).toBe("");
    expect(row.country).toBe("");
    expect(row.image_url).toBe("");
  });

  it("parses image_url, hobbydb_url, and more_info_url when present", () => {
    const csv = [
      HEADER_NEW,
      "Seattle,city,,Washington,United States,US,Been There,2018,47.6062,-122.3321,https://example.com/img.jpg,https://hobbydb.com/x,https://starbucks-mugs.com/mug/y/,A note",
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
    name: "Seattle", scope: "city", venue_series: "", region: "Washington", country: "United States",
    country_code: "US", series: "Been There", year: 2018,
    lat: 47.6062, lng: -122.3321, image_url: "", hobbydb_url: "", more_info_url: "", notes: "",
  };
  const existing = {
    id: "abc123",
    scope: "city", venue_series: "",
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

  it("returns false when scope differs", () => {
    expect(rowMatchesExisting({ ...base, scope: "state" }, existing)).toBe(false);
  });

  it("returns false when venue_series differs", () => {
    expect(rowMatchesExisting({ ...base, venue_series: "Been There Disney Parks" }, existing)).toBe(false);
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

  it("treats missing scope in existing as 'city'", () => {
    const { scope: _scope, ...existingNoScope } = existing;
    expect(rowMatchesExisting(base, existingNoScope)).toBe(true);
  });

  it("returns true when image_url matches image_credit", () => {
    const url = "https://example.com/img.jpg";
    expect(rowMatchesExisting({ ...base, image_url: url }, { ...existing, image_credit: url })).toBe(true);
  });
});
