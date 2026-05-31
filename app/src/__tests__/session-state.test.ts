import { describe, it, expect } from "vitest";
import { tryParseJson } from "@/lib/session-state";

describe("tryParseJson", () => {
  it("parses a valid JSON string", () => {
    expect(tryParseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it("returns the fallback for null input", () => {
    expect(tryParseJson(null, { x: 0 })).toEqual({ x: 0 });
  });

  it("returns the fallback for an empty string", () => {
    expect(tryParseJson("", "default")).toBe("default");
  });

  it("returns the fallback for invalid JSON", () => {
    expect(tryParseJson("{bad json}", [])).toEqual([]);
  });

  it("parses arrays", () => {
    expect(tryParseJson("[1,2,3]", [])).toEqual([1, 2, 3]);
  });

  it("parses primitive values", () => {
    expect(tryParseJson("42", 0)).toBe(42);
    expect(tryParseJson('"hello"', "")).toBe("hello");
  });
});
