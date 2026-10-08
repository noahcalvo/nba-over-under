// Session tokens and link tokens. Web Crypto only, so this stays plain TypeScript.

const SESSION_TOKEN_BYTES = 32;
const LINK_ID_BYTES = 16;
const LINK_SIGNATURE_BYTES = 16;

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LINK_TOKEN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/;

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64url(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** The opaque value stored in the session cookie. */
export function createSessionToken(): string {
  return randomBase64url(SESSION_TOKEN_BYTES);
}

export function isSessionToken(value: string): boolean {
  return SESSION_TOKEN.test(value);
}

/** Hex SHA-256. The database stores this, never the token. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Primary key of an access_links row. */
export function createLinkId(): string {
  return randomBase64url(LINK_ID_BYTES);
}

async function signature(linkId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(linkId)));
  return base64url(mac.slice(0, LINK_SIGNATURE_BYTES));
}

/** `{linkId}.{sig}`: the database alone can't produce a working link, but the app can rebuild one from its id. */
export async function signLinkId(linkId: string, secret: string): Promise<string> {
  return `${linkId}.${await signature(linkId, secret)}`;
}

/** The link id when the token's signature is valid, otherwise null. Needs no database read. */
export async function verifyLinkToken(token: string, secret: string): Promise<string | null> {
  const match = LINK_TOKEN.exec(token);
  if (!match) return null;
  const [, linkId, given] = match;
  return constantTimeEqual(given, await signature(linkId, secret)) ? linkId : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
