import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/PageFallback";

export const metadata: Metadata = { title: "NBA game" };

/** A revisit within this many seconds reuses the last render instead of waiting for the server (see CLAUDE.md). */
export const unstable_dynamicStaleTime = 60;

export default function NbaGamePage({ params }: PageProps<"/nba/games/[gameId]">) {
  return (
    <Suspense fallback={<PageFallback label="Loading the game" />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: PageProps<"/nba/games/[gameId]">["params"] }) {
  const { gameId } = await params;
  return <h1 className="text-2xl font-bold">NBA game {gameId}</h1>;
}
