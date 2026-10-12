import { describe, expect, it } from "vitest";
import { normalSample, seededRandom, seedFor } from "./random";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = seededRandom(seedFor("MIN"));
    const b = seededRandom(seedFor("MIN"));
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it("gives another sequence for another seed, always in [0, 1)", () => {
    const a = seededRandom(seedFor("MIN"));
    const b = seededRandom(seedFor("BOS"));
    const values = Array.from({ length: 1000 }, a);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(values.slice(0, 5)).not.toEqual(Array.from({ length: 5 }, b));
  });
});

describe("normalSample", () => {
  it("has mean about 0 and standard deviation about 1", () => {
    const random = seededRandom(seedFor("normal"));
    const values = Array.from({ length: 10000 }, () => normalSample(random));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });
});
