import { describe, expect, it } from "vitest";
import {
  formatDateTimeET,
  formatGameDate,
  formatNumber,
  formatOrdinal,
  formatRecord,
  formatSigned,
  formatUpdatedAt,
  NOT_AVAILABLE,
} from "@/lib/format";

describe("formatSigned", () => {
  it("prefixes positives with +", () => {
    expect(formatSigned(1.75)).toBe("+1.8");
  });

  it("uses a true minus sign for negatives", () => {
    expect(formatSigned(-3.4)).toBe("−3.4");
  });

  it("shows values that round to zero without a sign", () => {
    expect(formatSigned(0)).toBe("0.0");
    expect(formatSigned(-0.04)).toBe("0.0");
  });

  it("supports other precisions", () => {
    expect(formatSigned(1.234, 2)).toBe("+1.23");
    expect(formatSigned(2, 0)).toBe("+2");
  });

  it("rounds negative halves away from zero, like positive halves", () => {
    expect(formatSigned(-1.75)).toBe("−1.8");
    expect(formatSigned(-0.25)).toBe("−0.3");
    expect(formatSigned(0.25)).toBe("+0.3");
  });
});

describe("formatNumber", () => {
  it("rounds to one decimal by default", () => {
    expect(formatNumber(51.25)).toBe("51.3");
    expect(formatNumber(49.5)).toBe("49.5");
  });

  it("uses a true minus sign and supports zero decimals", () => {
    expect(formatNumber(-1.5)).toBe("−1.5");
    expect(formatNumber(41, 0)).toBe("41");
  });

  it("rounds halves away from zero for negatives", () => {
    expect(formatNumber(-1.25)).toBe("−1.3");
    expect(formatNumber(-0.04)).toBe("0.0");
  });
});

describe("formatOrdinal", () => {
  it("handles st, nd, rd, th and the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(formatOrdinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd",
    ]);
  });
});

describe("formatRecord", () => {
  it("joins wins and losses with an en dash", () => {
    expect(formatRecord(30, 18)).toBe("30–18");
  });
});

describe("NOT_AVAILABLE", () => {
  it("is the copy for zero games played", () => {
    expect(NOT_AVAILABLE).toBe("Not available");
  });
});

describe("formatDateTimeET", () => {
  it("formats in Eastern time", () => {
    expect(formatDateTimeET("2026-10-08T19:42:00.000Z")).toBe("Oct 8, 3:42 PM ET");
    expect(formatDateTimeET("2026-01-15T05:05:00.000Z")).toBe("Jan 15, 12:05 AM ET");
  });
});

describe("formatUpdatedAt", () => {
  it("shows month, day and time", () => {
    expect(formatUpdatedAt("2026-10-15T10:02:00.000Z", "UTC")).toBe("Oct 15, 10:02 AM");
    expect(formatUpdatedAt("2026-10-15T10:02:00.000Z", "America/New_York")).toBe("Oct 15, 6:02 AM");
  });
});

describe("formatGameDate", () => {
  it("shows the weekday and date in US Eastern", () => {
    expect(formatGameDate("2025-10-22T23:00Z")).toBe("Wed, Oct 22");
    // 01:30 UTC on the 17th is still the 16th in New York.
    expect(formatGameDate("2025-12-17T01:30Z")).toBe("Tue, Dec 16");
  });
});
