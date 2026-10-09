import { BookOpen, ChevronDown, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { LINES } from "@/config/lines";
import { SCORING, type ScoringConfig } from "@/config/scoring";
import { Panel } from "@/components/ui/Panel";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatNumber } from "@/lib/format";
import { callPoints, signedMargin } from "@/lib/scoring";

// An illustration only: an Over on a 41.5 line that finishes with 45 wins.
const EXAMPLE = { line: 41.5, wins: 45 };

/** Decimal places a weight needs to show exactly: 1 → 0, 0.1 → 1. */
function digitsOf(value: number): number {
  return (String(value).split(".")[1] ?? "").length;
}

function RuleValue({ value }: { value: number }) {
  return <SignedValue value={value} digits={digitsOf(value)} className="font-display text-2xl font-bold sm:text-3xl" />;
}

function RuleGroup({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-700 bg-ink-900/50">
      <h3 className="px-4 pt-3 pb-2 font-display text-xl font-semibold text-fog-50 sm:px-5 sm:text-2xl">{title}</h3>
      <dl className="mx-3 divide-y divide-ink-700 border-t border-ink-700 sm:mx-4">{children}</dl>
      {footer && <p className="mx-3 border-t border-ink-700 px-1 py-3 text-sm text-fog-400 sm:mx-4 sm:px-2">{footer}</p>}
    </section>
  );
}

function Rule({ label, note, value }: { label: string; note?: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-2.5 sm:px-2">
      <dt className="min-w-0">
        <span className="block text-base font-medium text-fog-50 sm:text-lg">{label}</span>
        {note && <span className="block text-sm text-fog-300">{note}</span>}
      </dt>
      <dd className="shrink-0">
        <RuleValue value={value} />
      </dd>
    </div>
  );
}

function ExampleTerm({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-2xl font-bold sm:text-3xl">{value}</span>
      <span className="text-sm text-fog-300">{label}</span>
    </div>
  );
}

function Example({ config }: { config: ScoringConfig }) {
  const margin = signedMargin("OVER", EXAMPLE.line, EXAMPLE.wins);
  const marginPoints = margin * config.marginWeight;
  const total = callPoints(margin, config);
  const base = margin > 0 ? config.correctCall : config.missedCall;
  return (
    <section className="rounded-lg border border-ink-700 bg-ink-900/50 px-4 py-3 sm:px-5">
      <h3 className="font-display text-xl font-semibold text-fog-50 sm:text-2xl">Example</h3>
      <p className="mt-1 text-fog-300">
        You picked Over {formatNumber(EXAMPLE.line)}. The team finishes with {formatNumber(EXAMPLE.wins, 0)} wins.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-around gap-x-4 gap-y-2">
        <ExampleTerm value={<SignedValue value={base} digits={0} />} label={margin > 0 ? "Correct pick" : "Incorrect pick"} />
        <span aria-hidden className="font-display text-3xl text-fog-300">+</span>
        <ExampleTerm value={<SignedValue value={marginPoints} digits={2} />} label={`${formatNumber(margin)}-win margin`} />
        <span aria-hidden className="font-display text-3xl text-fog-300">=</span>
        <span className="font-display text-3xl font-bold text-positive sm:text-4xl">
          {formatNumber(total, 2)} points
        </span>
      </div>
    </section>
  );
}

function MoreDetails({ config }: { config: ScoringConfig }) {
  return (
    <details className="group rounded-lg border border-ink-700 bg-ink-900/50">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <FileText aria-hidden className="size-6 shrink-0 text-fog-300" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fog-50">More details</span>
          <span className="block text-sm text-fog-300">Projections, final scores, and locked lines</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-fog-300 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mx-4 flex list-disc flex-col gap-2 border-t border-ink-700 py-3 pl-5 text-sm text-fog-300 sm:mx-5">
        <li>
          <span className="font-semibold text-fog-50">Projected</span> scores use each team&apos;s win pace: wins ÷
          games played × {config.seasonGames}. A team that hasn&apos;t played yet shows &ldquo;Not available&rdquo;.
        </li>
        <li>
          <span className="font-semibold text-fog-50">Final</span> scores settle once a team has played all{" "}
          {config.seasonGames} games. Until then they show &ldquo;Pending&rdquo;.
        </li>
        <li>
          <span className="font-semibold text-fog-50">Locked lines</span> are the {LINES.book} season win totals
          (or the commissioner&apos;s overrides) frozen when the draft starts. Later line moves never change scores.
        </li>
        <li>Standings rank by total points; ties go to the larger total margin.</li>
        <li>Scoring weights and round count aren&apos;t configurable yet.</li>
      </ul>
    </details>
  );
}

/** The league's scoring rules, read from the scoring config so the page never disagrees with the standings. */
export function ScoringRulesPanel({ config = SCORING }: { config?: ScoringConfig }) {
  return (
    <Panel
      title={<span className="text-2xl sm:text-3xl">How scoring works</span>}
      actions={
        <span className="inline-flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm font-semibold text-link">
          <BookOpen aria-hidden className="size-4" />
          Current league rules
        </span>
      }
      bodyClassName="flex flex-col gap-4 p-3 sm:p-4"
    >
      <RuleGroup title="Pick and fade points">
        <Rule label="Correct pick" value={config.correctCall} />
        <Rule label="Incorrect pick" value={config.missedCall} />
        <Rule label="Successful fade" note="The targeted pick loses." value={config.fadeHit} />
        <Rule label="Unsuccessful fade" note="The targeted pick wins." value={config.fadeMiss} />
        <Rule label="Push" note="Final wins equal the locked line. Both pick and fade earn 0." value={0} />
      </RuleGroup>
      <RuleGroup
        title="Extra points for the margin"
        footer={`Margin points apply to picks only. Fades always earn ${formatNumber(config.fadeHit, digitsOf(config.fadeHit))} or ${formatNumber(config.fadeMiss, digitsOf(config.fadeMiss))}.`}
      >
        <Rule label="Each win on the correct side of the line" value={config.marginWeight} />
        <Rule label="Each win on the wrong side of the line" value={-config.marginWeight} />
      </RuleGroup>
      <Example config={config} />
      <MoreDetails config={config} />
    </Panel>
  );
}
