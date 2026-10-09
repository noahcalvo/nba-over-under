import { Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { SignedValue } from "@/components/ui/SignedValue";
import { managerLabel } from "@/lib/league/managers";
import type { TeamRecord } from "@/lib/records/types";
import { fadeDisplay, pickPoints, pickStatus, type FadeOnPick, type SideOwnership } from "@/lib/team-detail";
import type { Side } from "@/lib/types";

const SIDE_STYLE: Record<Side, { label: string; frame: string; heading: string }> = {
  OVER: { label: "Over", frame: "border-over bg-over-deep/20", heading: "text-over" },
  UNDER: { label: "Under", frame: "border-under bg-under-deep/40", heading: "text-under" },
};

export function OwnershipCard({
  ownership,
  record,
  showProjected,
}: {
  ownership: SideOwnership;
  record: TeamRecord;
  showProjected: boolean;
}) {
  const style = SIDE_STYLE[ownership.side];
  const points = pickPoints(ownership, showProjected);
  const status = pickStatus(ownership, record, showProjected);
  return (
    <fieldset className={`min-w-0 rounded-xl border-2 px-4 pb-4 sm:px-6 sm:pb-6 ${style.frame}`}>
      <legend className={`ml-2 px-3 font-display text-3xl font-bold uppercase leading-none sm:text-4xl ${style.heading}`}>
        {style.label}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-3">
        {ownership.manager ? (
          <div className="flex min-w-0 items-center gap-3">
            <ManagerAvatar manager={ownership.manager} size="lg" />
            <p className="truncate text-xl font-semibold text-fog-50">{managerLabel(ownership.manager)}</p>
          </div>
        ) : (
          <p className="text-xl font-semibold text-fog-300">Undrafted</p>
        )}
        {(points || status) && (
          <div className="min-w-0 sm:text-right">
            {points && (
              <>
                <p className="text-sm text-fog-300">{points.label}</p>
                <SignedValue value={points.value} digits={2} className="block font-display text-4xl font-bold leading-tight" />
              </>
            )}
            {status && <p className="text-sm text-fog-300">{status.label}</p>}
          </div>
        )}
      </div>
      {ownership.pick && <FadeList fades={ownership.fades} side={ownership.side} showProjected={showProjected} />}
    </fieldset>
  );
}

function FadeList({ fades, side, showProjected }: { fades: FadeOnPick[]; side: Side; showProjected: boolean }) {
  if (fades.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-4 text-fog-300">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-ink-600">
          <Users aria-hidden className="size-5" />
        </span>
        No fades on this pick.
      </div>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-ink-700 rounded-lg border border-ink-700 bg-ink-900/60">
      {fades.map((fade) => {
        const display = fadeDisplay(fade, showProjected);
        return (
          <li key={fade.fade.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ManagerAvatar manager={fade.manager} size="lg" />
            <p className="min-w-0 flex-1 text-fog-50">
              {managerLabel(fade.manager)} is fading this {SIDE_STYLE[side].label}
            </p>
            {display && (
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={display.status.tone}>{display.status.label}</Badge>
                <SignedValue value={display.points} digits={0} suffix={display.pointsLabel} className="text-sm" />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
