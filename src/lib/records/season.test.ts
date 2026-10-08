import { describe, expect, it } from "vitest";
import { seasonEndYear, seasonLabelFor } from "@/lib/records/season";

describe("seasonEndYear", () => {
  it("reads the end year from a season label with an en dash or hyphen", () => {
    expect(seasonEndYear("2025–26")).toBe(2026);
    expect(seasonEndYear("2026-27")).toBe(2027);
    expect(seasonEndYear("1999–00")).toBe(2000);
  });

  it("rejects anything else", () => {
    expect(seasonEndYear("2025–27")).toBeNull();
    expect(seasonEndYear("2025")).toBeNull();
    expect(seasonEndYear("")).toBeNull();
  });
});

describe("seasonLabelFor", () => {
  it("formats an end year as a season label", () => {
    expect(seasonLabelFor(2027)).toBe("2026–27");
    expect(seasonLabelFor(2000)).toBe("1999–00");
  });
});
