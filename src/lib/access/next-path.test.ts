import { describe, expect, it } from "vitest";
import { safeNextPath, signInHref } from "./next-path";

describe("safeNextPath", () => {
  it.each(["/l/abc", "/challenge?x=1", "/", "/i/tok?x=1#top"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil",
    "javascript:alert(1)",
    "",
    "/a\nb",
    "/a\tb",
    "/a\u007fb",
    "relative/path",
    `/${"a".repeat(2048)}`,
  ])("falls back to / for %j", (path) => {
    expect(safeNextPath(path)).toBe("/");
  });

  it.each([undefined, null, 42, {}, ["/a"]])("falls back to / for a non-string (%j)", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("accepts exactly 2048 characters", () => {
    const path = `/${"a".repeat(2047)}`;
    expect(safeNextPath(path)).toBe(path);
  });
});

describe("signInHref", () => {
  it("encodes the destination", () => {
    expect(signInHref("/i/tok?x=1")).toBe("/sign-in?next=%2Fi%2Ftok%3Fx%3D1");
  });
});
