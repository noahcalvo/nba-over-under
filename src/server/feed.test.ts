import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedError } from "@/lib/feed-error";

vi.mock("server-only", () => ({}));
const { fetchFeedJson } = await import("@/server/feed");

const OPTS = { source: "ESPN", timeoutMs: 8000 };

afterEach(() => vi.unstubAllGlobals());

describe("fetchFeedJson", () => {
  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ a: 1 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).resolves.toEqual({ a: 1 });
  });

  it("names the HTTP status of a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow(
      new FeedError("ESPN returned HTTP 403."),
    );
  });

  it("explains a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("t", "TimeoutError"))));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow("ESPN didn't respond within 8 s.");
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow("Couldn't reach ESPN.");
  });

  it("explains a body that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toThrow(
      "ESPN sent a response we couldn't read.",
    );
  });

  it("only throws FeedError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(fetchFeedJson("https://example.test/x", OPTS)).rejects.toBeInstanceOf(FeedError);
  });
});
