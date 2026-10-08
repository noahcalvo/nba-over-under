import { describe, expect, it } from "vitest";
import { linkPath, linkStatus } from "@/lib/access/links";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const BEFORE = new Date("2026-10-08T11:00:00.000Z");
const AFTER = new Date("2026-10-08T13:00:00.000Z");
const FRESH = { expiresAt: null, usedAt: null, revokedAt: null };

describe("linkStatus", () => {
  it("is active until revoked, used or expired", () => {
    expect(linkStatus(FRESH, NOW)).toBe("active");
    expect(linkStatus({ ...FRESH, expiresAt: AFTER }, NOW)).toBe("active");
  });

  it("reports revoked, then used, then expired", () => {
    expect(linkStatus({ expiresAt: BEFORE, usedAt: BEFORE, revokedAt: BEFORE }, NOW)).toBe("revoked");
    expect(linkStatus({ expiresAt: BEFORE, usedAt: BEFORE, revokedAt: null }, NOW)).toBe("used");
    expect(linkStatus({ ...FRESH, expiresAt: BEFORE }, NOW)).toBe("expired");
    expect(linkStatus({ ...FRESH, expiresAt: NOW }, NOW)).toBe("expired");
  });
});

describe("linkPath", () => {
  it("opens the link page", () => {
    expect(linkPath("abc.def")).toBe("/i/abc.def");
  });
});
