import { describe, it, expect } from "vitest";
import { countryCodeToFlag } from "@/lib/country";

describe("countryCodeToFlag", () => {
  it("converts US to the US flag emoji", () => {
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
  });

  it("converts GB to the UK flag emoji", () => {
    expect(countryCodeToFlag("GB")).toBe("🇬🇧");
  });

  it("is case-insensitive", () => {
    expect(countryCodeToFlag("jp")).toBe(countryCodeToFlag("JP"));
  });

  it("returns empty string for empty input", () => {
    expect(countryCodeToFlag("")).toBe("");
  });

  it("returns empty string for codes that are not exactly 2 characters", () => {
    expect(countryCodeToFlag("U")).toBe("");
    expect(countryCodeToFlag("USA")).toBe("");
  });
});
