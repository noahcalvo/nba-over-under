import { safeNextPath, signInHref } from "@/lib/access/next-path";
import { readAuthConfig } from "@/lib/env";
import { getAccount } from "@/server/account";
import { getAuth } from "@/server/auth";

/**
 * GET /sign-in/start?next=<path>: straight to Google's account picker, skipping the sign-in page. It makes the same
 * request the page's "Continue with Google" button makes (Better Auth's social sign-in, so its origin check, state
 * cookie and the previews' OAuth proxy all apply) and redirects to the URL it returns, passing the state cookie on.
 * Without Google (development sign-in, or sign-in unavailable) and when Google can't be started, the sign-in page
 * takes over. Reached only through `SignInLink` (a plain `<a>`), never prefetched.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const page = new URL(signInHref(next), url);
  if (await getAccount()) return Response.redirect(new URL(next, url), 303);

  const config = readAuthConfig(process.env);
  const auth = await getAuth();
  if (!config.ok || !config.config.google || !auth) return Response.redirect(page, 303);

  const headers = new Headers({ "content-type": "application/json", origin: url.origin });
  for (const name of ["cookie", "user-agent", "x-forwarded-for"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const started = await auth.handler(
    new Request(new URL("/api/auth/sign-in/social", url), {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "google", callbackURL: next, errorCallbackURL: signInHref(next) }),
    }),
  );
  const body: unknown = started.ok ? await started.json() : null;
  const google = body && typeof body === "object" && "url" in body && typeof body.url === "string" ? body.url : null;
  if (!google) {
    page.searchParams.set("error", "start_failed");
    return Response.redirect(page, 303);
  }

  const response = new Response(null, { status: 303, headers: { location: google, "cache-control": "no-store" } });
  for (const cookie of started.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
