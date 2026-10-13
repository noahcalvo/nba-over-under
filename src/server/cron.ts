import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Null when the request carries Vercel's `Bearer CRON_SECRET`; otherwise the response to send. */
export function cronRejection(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length === expected.length && timingSafeEqual(given, expected)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
