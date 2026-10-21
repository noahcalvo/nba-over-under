"use client";

import { CalendarClock, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/components/ui/use-prefers-reduced-motion";
import { CHALLENGE } from "@/config/challenge";
import {
  boardCards,
  draftBase,
  draftToStore,
  entryPicks,
  newerEntry,
  pickCount,
  saveState,
  type ChallengeDraft,
} from "@/lib/challenge/board";
import { filterTeams, sortTeams, type TeamFilter, type TeamSort } from "@/lib/challenge/grid";
import { hasUnsavedChanges, movedTeams, saveLabel } from "@/lib/challenge/movement";
import { isLocked } from "@/lib/challenge/phase";
import { pickMap } from "@/lib/challenge/picks";
import type { ChallengeEntry, PickMap } from "@/lib/challenge/types";
import { formatDateTimeET } from "@/lib/format";
import type { Side, TeamId } from "@/lib/types";
import type { ChallengeBoardData } from "@/server/challenge";
import { BoardFilters } from "./BoardFilters";
import { getDraft, subscribeDraft, writeDraft } from "./challenge-draft";
import { BoardTitle } from "./ChallengeFallback";
import { DeadlinePanel } from "./DeadlinePanel";
import { MovementPanel } from "./MovementPanel";
import { ProgressPanel } from "./ProgressPanel";
import { LockedLinks, NAME_INPUT_ID, SIGN_IN_TO_SAVE_HREF, SavePanel, saveStatusText } from "./SavePanel";
import { ScoringReminder } from "./ScoringReminder";
import { TeamPickCard } from "./TeamPickCard";
import { useClock } from "./use-clock";

const EMPTY_PICKS: PickMap = {};

type SaveResult = { ok: true; entry: ChallengeEntry } | { ok: false; error: string | null; message: string };

function isEntry(value: unknown): value is ChallengeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ChallengeEntry>;
  return typeof entry.savedAt === "string" && typeof entry.displayName === "string" && Array.isArray(entry.picks);
}

async function putEntry(body: { displayName: string; picks: Array<{ teamId: TeamId; side: Side }> }): Promise<SaveResult> {
  try {
    const response = await fetch("/api/challenge/entry", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => ({}));
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (response.ok && isEntry(record.entry)) return { ok: true, entry: record.entry };
    return {
      ok: false,
      error: typeof record.error === "string" ? record.error : null,
      message: typeof record.message === "string" ? record.message : "Something went wrong. Try again.",
    };
  } catch {
    return { ok: false, error: null, message: "Couldn't reach the server. Try again." };
  }
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-600 bg-ink-850 px-4 py-3 text-sm text-fog-50">
      <span aria-hidden className="mt-0.5 shrink-0 text-fog-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function ChallengeBoard({ data }: { data: ChallengeBoardData }) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const season = CHALLENGE.seasonYear;
  const locked = isLocked(data.phase);
  const frozen = data.lines.frozen;

  const storedDraft = useSyncExternalStore(subscribeDraft, () => getDraft(season), () => null);
  const draft = locked ? null : storedDraft;
  const [savedOverride, setSavedOverride] = useState<ChallengeEntry | null>(null);
  const saved = newerEntry(data.entry, savedOverride);
  const savedPicks = saved?.picks ?? [];

  const working: PickMap = draft?.picks ?? (saved ? pickMap(saved.picks) : EMPTY_PICKS);
  // What was typed or saved. The account's name only fills a field that would otherwise be empty, and stops once the
  // viewer edits the field (clearing it must not bring the name straight back).
  const typedName = draft?.name ?? saved?.displayName ?? "";
  const [nameTouched, setNameTouched] = useState(false);
  const name = typedName !== "" || nameTouched ? typedName : (data.accountName ?? "").slice(0, CHALLENGE.nameMaxLength);

  const [filter, setFilter] = useState<TeamFilter>("all");
  const [movedOnly, setMovedOnly] = useState(false);
  const [sort, setSort] = useState<TeamSort>("conference");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const gridRef = useRef<HTMLElement>(null);

  const clock = useClock(data.now);
  const deadline = data.season?.deadline ?? null;
  const expired = !locked && deadline !== null && clock >= Date.parse(deadline);

  const teamIds = data.teams.map((team) => team.info.id);
  const cards = boardCards(data.teams, working, savedPicks);
  const visible = sortTeams(filterTeams(cards, filter, movedOnly), sort);
  const selected = pickCount(teamIds, working);
  // The offered name alone is not a change: with nothing picked or typed there is nothing to warn about or discard.
  const dirty = !locked && hasUnsavedChanges(saved, working, typedName);
  const currentLines: Record<TeamId, number> = Object.fromEntries(
    data.teams.flatMap((team) => (team.line === null ? [] : [[team.info.id, team.line]])),
  );
  const movedCount = saved ? movedTeams(saved.picks, working, currentLines).length : 0;
  const { canSave, reason, blocker } = saveState({
    phase: data.phase,
    expired,
    selected,
    total: teamIds.length,
    name,
    dirty,
    hasSaved: saved !== null,
  });
  const label = saveLabel(movedCount);

  // Drafts end with the challenge: once it locks, nothing unsaved can count.
  useEffect(() => {
    if (locked && storedDraft) writeDraft(season, null);
  }, [locked, storedDraft, season]);

  useEffect(() => {
    if (!dirty || locked) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, locked]);

  /**
   * Applies a change to the latest stored state, not this render's copy: several clicks before a re-render must all
   * land. The draft is kept while it differs at all from the saved entry (a name being typed keeps its spaces).
   */
  function update(change: (base: ChallengeDraft) => ChallengeDraft) {
    writeDraft(season, draftToStore(saved, change(draftBase(getDraft(season), saved))));
  }

  function pick(teamId: TeamId, side: Side) {
    if (locked || expired) return;
    update((base) => ({ ...base, picks: { ...base.picks, [teamId]: side } }));
  }

  function showMoved() {
    setFilter("all");
    setMovedOnly(true);
    gridRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function focusName() {
    const input = document.getElementById(NAME_INPUT_ID);
    input?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  }

  async function save() {
    const picks = entryPicks(teamIds, working);
    if (!picks || !canSave || saving) return;
    setSaving(true);
    setError(null);
    const result = await putEntry({ displayName: name, picks });
    setSaving(false);
    if (result.ok) {
      setSavedOverride(result.entry);
      // Keep anything changed while the request was out; drop the draft the server now holds.
      const current = getDraft(season);
      // A draft that never held a typed name was saved under the offered one.
      const currentName = current?.name === "" ? result.entry.displayName : (current?.name ?? "");
      writeDraft(season, current && hasUnsavedChanges(result.entry, current.picks, currentName) ? current : null);
      setAnnouncement(`Saved ${formatDateTimeET(result.entry.savedAt)}`);
      router.refresh();
    } else {
      setError(result.message);
      if (result.error === "challenge_locked") router.refresh();
    }
  }

  const missing = data.season?.frozen?.missing ?? [];
  const missingNames = data.teams.filter((team) => missing.includes(team.info.id)).map((team) => `the ${team.info.city} ${team.info.name}`);
  const lockedAt = data.season?.frozen?.lockedAt ?? null;
  const statusText = saveStatusText({ blocker, dirty, savedAt: saved?.savedAt ?? null });

  return (
    <div className="flex flex-col gap-6 pb-24 xl:pb-0">
      <header className="flex flex-col gap-2">
        <BoardTitle seasonLabel={data.seasonLabel} />
        <p className="max-w-3xl text-lg text-fog-300">
          {locked
            ? "Picks are locked. Every entry scores against the same frozen lines."
            : `Make your Over/Under picks for all 30 NBA teams. Lines update throughout the preseason. You can change your picks until ${CHALLENGE.deadlineOverride ? "the deadline" : `${CHALLENGE.lockMinutesBeforeTipoff} minutes before the first regular-season game`}.`}
        </p>
      </header>

      {(data.phase === "locked" || data.phase === "in_season" || data.phase === "final") && (
        <Notice icon={<Lock className="size-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              The challenge locked{lockedAt ? ` ${formatDateTimeET(lockedAt)}` : ""}. Picks are read-only and score against
              the frozen {data.lines.book} lines.
            </p>
            <LockedLinks />
          </div>
        </Notice>
      )}
      {data.phase === "locking" && (
        <Notice icon={<Lock className="size-4" />}>
          <p>Picks are locking: the frozen lines are being stored. Reload in a moment.</p>
        </Notice>
      )}
      {data.phase === "schedule_unknown" && (
        <Notice icon={<CalendarClock className="size-4" />}>
          <p>
            Saving is paused until the NBA schedule is read
            {data.season?.scheduleError ? ` (${data.season.scheduleError})` : ""}. Your selections are kept in this
            browser until then.
          </p>
        </Notice>
      )}
      {missingNames.length > 0 && (
        <Notice icon={<TriangleAlert className="size-4" />}>
          <p>
            No {data.lines.book} line was observed before the deadline for {listNames(missingNames)}. Picks on{" "}
            {missingNames.length === 1 ? "that team" : "those teams"} are unavailable and count for nobody.
          </p>
        </Notice>
      )}
      {!frozen && data.lines.error && (
        <Notice icon={<TriangleAlert className="size-4" />}>
          <p>
            Couldn&apos;t refresh {data.lines.book} lines: {data.lines.error}
            {data.lines.asOf
              ? ` Showing lines from ${formatDateTimeET(data.lines.asOf)}.`
              : " No lines yet; you can still pick and save."}
          </p>
        </Notice>
      )}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section
          ref={gridRef}
          aria-label="Teams"
          className="@container order-2 flex min-w-0 scroll-mt-20 flex-col gap-4 lg:scroll-mt-8 xl:order-none"
        >
          <BoardFilters
            filter={filter}
            onFilter={setFilter}
            movedOnly={movedOnly}
            onMovedOnly={setMovedOnly}
            sort={sort}
            onSort={setSort}
            counts={{ unpicked: teamIds.length - selected }}
          />
          {visible.length > 0 ? (
            <ul className="grid gap-3 @lg:grid-cols-2 @2xl:grid-cols-3 @min-[46rem]:grid-cols-4">
              {visible.map((team) => (
                <TeamPickCard
                  key={team.info.id}
                  team={team}
                  locked={locked}
                  frozen={frozen}
                  hasSaved={saved !== null}
                  onPick={(side) => pick(team.info.id, side)}
                />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-ink-600 p-8 text-center">
              <p className="text-fog-300">No teams match these filters.</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  setFilter("all");
                  setMovedOnly(false);
                }}
              >
                Show all teams
              </Button>
            </div>
          )}
        </section>

        <aside
          aria-label="Your entry"
          className="contents xl:sticky xl:top-8 xl:flex xl:max-h-[calc(100dvh-4rem)] xl:flex-col xl:gap-4 xl:overflow-y-auto"
        >
          <div className="order-1 grid gap-4 sm:grid-cols-2 xl:order-none xl:grid-cols-1">
            <DeadlinePanel
              deadline={deadline}
              openingGame={data.season?.openingGame ?? null}
              scheduleCheckedAt={data.season?.scheduleCheckedAt ?? null}
              scheduleError={data.season?.scheduleError ?? null}
              lockedAt={lockedAt}
              clock={clock}
              locked={locked}
            />
            <ProgressPanel selected={selected} saved={saved !== null} dirty={dirty} />
          </div>
          <div className="order-3 grid gap-4 sm:grid-cols-2 xl:order-none xl:grid-cols-1">
            {!frozen && <MovementPanel movedCount={movedCount} hasSaved={saved !== null} onShowMoved={showMoved} />}
            <ScoringReminder />
            <div className={!frozen ? "sm:col-span-2 xl:col-span-1" : ""}>
              <SavePanel
                name={name}
                onName={(next) => {
                  setNameTouched(true);
                  update((base) => ({ ...base, name: next }));
                }}
                canSave={canSave}
                label={label}
                blocker={blocker}
                savedAt={saved?.savedAt ?? null}
                saving={saving}
                onSave={save}
                onDiscard={() => writeDraft(season, null)}
                dirty={dirty}
                locked={locked}
                signedIn={data.signedIn}
              />
            </div>
          </div>
        </aside>
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64 xl:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-bold leading-tight tabular-nums text-fog-50">
                {selected} / {teamIds.length}
              </p>
              <p className={`truncate text-xs ${!blocker && !dirty && saved ? "text-accent" : "text-fog-300"}`}>
                {statusText}
              </p>
            </div>
            {!data.signedIn ? (
              <Link href={SIGN_IN_TO_SAVE_HREF} className={`${buttonClasses("primary", "lg")} min-w-0 max-w-[65%] leading-tight`}>
                Sign in to save
              </Link>
            ) : reason === "no_name" ? (
              <Button variant="secondary" size="lg" onClick={focusName} className="shrink-0">
                Add your name
              </Button>
            ) : (
              <Button size="lg" onClick={save} disabled={!canSave || saving} className="min-w-0 max-w-[65%] leading-tight">
                {saving ? "Saving…" : label}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
