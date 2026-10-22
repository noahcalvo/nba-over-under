const MAX_LENGTH = 2048;

/**
 * Where to send someone after signing in: only a path on this site. Anything else (another origin, a protocol-relative
 * `//host`, a backslash, control characters, a very long string, a non-string) becomes the home page.
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw.length === 0 || raw.length > MAX_LENGTH) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}

/** The sign-in page, remembering where to return to. */
export function signInHref(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * Starts Google sign-in straight away (`src/app/sign-in/start/route.ts`), skipping the sign-in page. Link to it only
 * through `SignInLink` (a plain `<a>`): a prefetching `<Link>` would start a sign-in on every prefetch.
 */
export function startSignInHref(next: string): string {
  return `/sign-in/start?next=${encodeURIComponent(next)}`;
}
