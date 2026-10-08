import { describe, expect, it } from "vitest";
import {
  base64url,
  createLinkId,
  createSessionToken,
  hashSessionToken,
  isSessionToken,
  signLinkId,
  verifyLinkToken,
} from "@/lib/access/tokens";

const SECRET = "test-link-secret-that-is-long-enough";

describe("session tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isSessionToken(token)).toBe(true);
    expect(createSessionToken()).not.toBe(token);
  });

  it("rejects malformed cookie values", () => {
    expect(isSessionToken("")).toBe(false);
    expect(isSessionToken("abc")).toBe(false);
    expect(isSessionToken(`${createSessionToken()}=`)).toBe(false);
  });

  it("hash to a stable hex SHA-256", async () => {
    // SHA-256("abc"), a published test vector.
    await expect(hashSessionToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("link tokens", () => {
  it("round-trip a link id", async () => {
    const linkId = createLinkId();
    expect(linkId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const token = await signLinkId(linkId, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    await expect(verifyLinkToken(token, SECRET)).resolves.toBe(linkId);
  });

  it("reject a tampered signature, a swapped id, another secret and garbage", async () => {
    const linkId = createLinkId();
    const token = await signLinkId(linkId, SECRET);
    const [, sig] = token.split(".");
    const flipped = `${linkId}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    await expect(verifyLinkToken(flipped, SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(`${createLinkId()}.${sig}`, SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(token, "another-secret-that-is-long-enough!!")).resolves.toBeNull();
    await expect(verifyLinkToken("nope", SECRET)).resolves.toBeNull();
    await expect(verifyLinkToken(`${linkId}.`, SECRET)).resolves.toBeNull();
  });
});

describe("base64url", () => {
  it("uses the URL-safe alphabet without padding", () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
  });
});
