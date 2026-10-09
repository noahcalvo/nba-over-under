import { Suspense } from "react";
import { BackToLeague } from "./BackToLeague";

export default function TeamNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="font-display text-4xl font-bold">Team not found</h1>
      <p className="text-fog-300">That team isn&apos;t in the NBA. Check the link, or pick a team from the league overview.</p>
      <Suspense fallback={null}>
        <BackToLeague />
      </Suspense>
    </div>
  );
}
