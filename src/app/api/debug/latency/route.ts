import { sql } from "drizzle-orm";
import { loadLeague } from "@/db/leagues";
import { getDb } from "@/server/db";

// TEMPORARY (page-render-time investigation): where the server spends its time. Remove when the investigation ends.
export async function GET(request: Request) {
  const leagueId = new URL(request.url).searchParams.get("league") ?? "bgtpyh";
  const timings: Record<string, number> = {};
  const lap = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await work();
    timings[label] = Math.round((performance.now() - start) * 10) / 10;
    return result;
  };
  const db = await lap("getDb", () => getDb());
  for (let i = 1; i <= 3; i++) await lap(`select1_${i}`, () => db.execute(sql`select 1`));
  await lap("loadLeague", () => loadLeague(db, leagueId));
  await lap("loadLeague_again", () => loadLeague(db, leagueId));
  // Timings only: a select 1 well above a few ms means the database is far from the function region.
  return Response.json({ region: process.env.VERCEL_REGION ?? null, timings });
}
