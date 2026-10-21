import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { authAvailability, getAuth } from "@/server/auth";

/** The signed-in Google account (or development sign-in), for rendering and for authorizing writes. */
export interface Account {
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

/** The viewer's account, looked up once per request. Null when signed out or when sign-in is unavailable. */
export const getAccount = cache(async (): Promise<Account | null> => {
  // headers() first: it marks the render as request-time, so no session read runs during a prerender.
  const requestHeaders = await headers();
  const auth = await getAuth();
  if (!auth) return null;
  // Renders never refresh the session: a render can't set the renewed cookie, so a refresh here would extend the
  // database row while the browser cookie still expired. Renewal happens through the /api/auth/get-session route
  // handler (the client account menu calls it once on mount when signed in).
  const session = await auth.api.getSession({ headers: requestHeaders, query: { disableRefresh: true } });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { userId: id, name, email, image: image ?? null };
});

/** The error a write returns when nobody is signed in: sign-in when it can work, otherwise that it is unavailable. */
export function signedOutError(): "sign_in_required" | "auth_unavailable" {
  return authAvailability().available ? "sign_in_required" : "auth_unavailable";
}
