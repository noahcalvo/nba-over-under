import Link from "next/link";
import { NotBuiltYet } from "@/components/ui/NotBuiltYet";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";

/** A demo page the scoring chapter will build around the user's own demo draft. Until then it points back to the draft. */
export function DemoChapterPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <NotBuiltYet
        title={title}
        description="This part of the demo comes with the scoring walkthrough: your own pick and fade, scored through a season."
      />
      <Link href={`/l/${DEMO_LEAGUE_ID}/draft`} className="font-semibold text-link hover:text-fog-50">
        Go to the demo draft
      </Link>
    </div>
  );
}
