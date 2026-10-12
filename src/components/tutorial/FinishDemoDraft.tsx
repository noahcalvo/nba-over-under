import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";

/** A demo page before this tab's demo draft is finished: the page follows the user's own picks, so it starts there. */
export function FinishDemoDraft({ title }: { title: string }) {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-dashed border-ink-600 bg-ink-850/60 p-8 text-center">
      <ClipboardList aria-hidden className="mx-auto size-10 text-fog-400" />
      <h1 className="mt-3 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-fog-300">
        Finish the demo draft first: this page follows your own demo picks and fade through a simulated season.
      </p>
      <Link href={`/l/${DEMO_LEAGUE_ID}/draft`} className={`${buttonClasses()} mt-5`}>
        Go to the demo draft
      </Link>
    </div>
  );
}
