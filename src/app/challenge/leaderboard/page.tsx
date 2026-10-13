import type { Metadata } from "next";
import { Suspense } from "react";
import { Leaderboard } from "@/components/challenge/Leaderboard";
import { ResultsFallback } from "@/components/challenge/ResultsFallback";
import { loadLeaderboard } from "@/server/challenge-pages";

export const metadata: Metadata = { title: "Leaderboard · 30/30 Challenge" };

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<ResultsFallback title="Leaderboard" />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  return <Leaderboard data={await loadLeaderboard()} />;
}
