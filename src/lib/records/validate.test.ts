import { describe, expect, it } from "vitest";
import { FeedError } from "@/lib/feed-error";
import { checkNoRegression } from "@/lib/records/validate";

describe("checkNoRegression", () => {
  const stored = { BOS: { wins: 10, losses: 5 }, MIN: { wins: 8, losses: 7 } };

  it("accepts equal or more games, and teams with nothing stored", () => {
    expect(() =>
      checkNoRegression(stored, { BOS: { wins: 10, losses: 5 }, MIN: { wins: 9, losses: 7 }, OKC: { wins: 1, losses: 0 } }),
    ).not.toThrow();
    expect(() => checkNoRegression({}, { BOS: { wins: 0, losses: 0 } })).not.toThrow();
  });

  it("accepts a same-length correction", () => {
    expect(() => checkNoRegression(stored, { BOS: { wins: 9, losses: 6 }, MIN: { wins: 8, losses: 7 } })).not.toThrow();
  });

  it("rejects fewer games played for any team", () => {
    const next = { BOS: { wins: 10, losses: 4 }, MIN: { wins: 8, losses: 7 } };
    expect(() => checkNoRegression(stored, next)).toThrow(FeedError);
    expect(() => checkNoRegression(stored, next)).toThrow(
      "The new standings had fewer games for BOS than the saved ones, so the saved records were kept.",
    );
  });
});
