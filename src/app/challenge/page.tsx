import { Suspense } from "react";
import { ChallengeBoard } from "@/components/challenge/ChallengeBoard";
import { ChallengeFallback } from "@/components/challenge/ChallengeFallback";
import { loadChallengeBoard } from "@/server/challenge";

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
