import { describe, it, expect } from "vitest";
import { buildCsv } from "@/lib/csv";

describe("buildCsv", () => {
  it("produces a header row and data rows", () => {
    const result = buildCsv(["name", "year"], [["Atlanta", "2019"]]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('"name","year"');
    expect(lines[1]).toBe('"Atlanta","2019"');
  });

  it("escapes internal double-quotes by doubling them", () => {
    const result = buildCsv(["note"], [[`He said "hello"`]]);
    expect(result).toContain('"He said ""hello"""');
  });

  it("handles null and undefined values as empty strings", () => {
    const result = buildCsv(["a", "b"], [[null, undefined]]);
    expect(result.split("\n")[1]).toBe('"",""');
  });

  it("handles numeric values", () => {
    const result = buildCsv(["year", "count"], [[2019, 42]]);
    expect(result.split("\n")[1]).toBe('"2019","42"');
  });

  it("returns only the header row when rows array is empty", () => {
    const result = buildCsv(["name"], []);
    expect(result).toBe('"name"');
  });

  it("handles multiple rows", () => {
    const result = buildCsv(["city"], [["Atlanta"], ["Boston"], ["Chicago"]]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(4);
  });
});
