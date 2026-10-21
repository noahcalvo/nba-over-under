import { Suspense } from "react";
import { Leaderboard } from "@/components/challenge/Leaderboard";
import { ResultsFallback } from "@/components/challenge/ResultsFallback";
import { loadLeaderboard } from "@/server/challenge-pages";

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
