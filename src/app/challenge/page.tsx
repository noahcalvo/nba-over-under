import type { Metadata } from "next";
import { Suspense } from "react";
import { ChallengeBoard } from "@/components/challenge/ChallengeBoard";
import { ChallengeFallback } from "@/components/challenge/ChallengeFallback";
import { loadChallengeBoard } from "@/server/challenge";

export const metadata: Metadata = { title: "30/30 Challenge" };

export default function ChallengePage() {
  return (
    <Suspense fallback={<ChallengeFallback />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  const data = await loadChallengeBoard();
  return <ChallengeBoard data={data} />;
}
