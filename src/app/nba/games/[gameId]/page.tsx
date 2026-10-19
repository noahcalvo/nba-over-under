import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameError, GamePage } from "@/components/nba/GamePage";
import { PageFallback } from "@/components/ui/PageFallback";
import { loadGamePage } from "@/server/nba-pages";

export const metadata: Metadata = { title: "NBA game" };

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function NbaGamePage({ params, searchParams }: PageProps<"/nba/games/[gameId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading the game" />}>
      <Game params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Game({
  params,
  searchParams,
}: {
  params: PageProps<"/nba/games/[gameId]">["params"];
  searchParams: PageProps<"/nba/games/[gameId]">["searchParams"];
}) {
  const [{ gameId }, query] = await Promise.all([params, searchParams]);
  const result = await loadGamePage(gameId, typeof query.date === "string" ? query.date : undefined);
  if (result.kind === "not_found") notFound();
  if (result.kind === "error") return <GameError message={result.message} backDay={result.backDay} />;
  return <GamePage data={result.data} />;
}
