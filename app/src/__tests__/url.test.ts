import { describe, it, expect } from "vitest";
import { displayHostname } from "@/lib/url";

describe("displayHostname", () => {
  it("returns the hostname from a valid URL", () => {
    expect(displayHostname("https://starbucks-mugs.com/cup/123")).toBe("starbucks-mugs.com");
  });

  it("strips the www. prefix", () => {
    expect(displayHostname("https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/123")).toBe("hobbydb.com");
  });

  it("does not strip non-www subdomains", () => {
    expect(displayHostname("https://shop.starbucks.com/product")).toBe("shop.starbucks.com");
  });

  it("returns empty string for an invalid URL", () => {
    expect(displayHostname("not a url")).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(displayHostname("")).toBe("");
  });

  it("handles URLs with no path", () => {
    expect(displayHostname("https://example.com")).toBe("example.com");
  });
});
