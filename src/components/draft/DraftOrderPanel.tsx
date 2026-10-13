"use client";

import { ArrowDown, ArrowUp, GripVertical, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { moveInOrder, shuffled } from "@/lib/league/draft-order";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { League } from "@/lib/types";

/**
 * The draft order before the draft. Everyone sees it; the commissioner drags rows (or uses the arrows), randomizes, and
 * saves. Nothing is sent before Save. The server checks the same rules (decideDraftOrder). Key it by the saved order so
 * a saved change (here or from another tab) resets the edit, while a seat being claimed doesn't.
 */
export function DraftOrderPanel({
  league,
  viewerId,
  canEdit,
  pending,
  onSave,
  onDirtyChange,
}: {
  league: League;
  viewerId: string | null;
  canEdit: boolean;
  pending: boolean;
  onSave: (order: string[]) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const saved = league.draft.seatOrder;
  const [order, setOrder] = useState<string[]>(saved);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dirty = order.some((id, index) => id !== saved[index]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const labelOf = (id: string) => {
    const manager = findManager(league.managers, id);
    return manager ? managerLabel(manager) : id;
  };

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder(moveInOrder(order, from, to));
    setAnnouncement(`${labelOf(order[from])} moved to draft position ${to + 1}.`);
  }

  function randomize() {
    const next = shuffled(order);
    setOrder(next);
    setAnnouncement(`Order randomized, not saved yet. ${labelOf(next[0])} picks first.`);
  }

  function discard() {
    setOrder(saved);
    setAnnouncement("Changes discarded.");
  }

  async function save() {
    if (await onSave(order)) setAnnouncement("Draft order saved.");
  }

  const editing = canEdit && !pending;

  return (
    <section aria-labelledby="draft-order-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="draft-order-title" className="text-sm font-semibold">
          Draft order
        </h3>
        {canEdit && dirty && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">Unsaved changes</span>
        )}
      </div>
      <p className="text-sm text-fog-400">
        Round 1 picks top to bottom; round 2 runs bottom to top, and so on.
        {canEdit
          ? " Drag a manager or use the arrows. Locks when the draft starts."
          : " Set by the commissioner. It can change until the draft starts."}
      </p>
      <ol className="flex max-w-2xl flex-col gap-2">
        {order.map((id, index) => {
          const manager = findManager(league.managers, id);
          if (!manager) return null;
          const label = managerLabel(manager);
          return (
            <li
              key={id}
              draggable={editing}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
                setDragging(index);
              }}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                if (dragging !== index) {
                  setOrder(moveInOrder(order, dragging, index));
                  setDragging(index);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) setAnnouncement(`${label} moved to draft position ${index + 1}.`);
              }}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-3 rounded-lg border bg-ink-900 px-3 py-2.5 ${
                dragging === index ? "border-accent/60 opacity-70" : "border-ink-700"
              } ${editing ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {canEdit && <GripVertical aria-hidden className="size-4 shrink-0 text-fog-400" />}
              <span
                aria-label={`Draft position ${index + 1}`}
                className="w-6 shrink-0 text-right font-display text-lg font-bold tabular-nums text-fog-300"
              >
                {index + 1}
              </span>
              <ManagerAvatar manager={manager} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {label}
                  {manager.id === viewerId && <span className="ml-2 text-xs text-accent">You</span>}
                </p>
                <p className="text-xs text-fog-400">
                  {manager.id === league.commissionerId
                    ? "Commissioner"
                    : manager.displayName === null
                      ? "Open seat"
                      : "Joined"}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    aria-label={`Move ${label} up`}
                    disabled={!editing || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    aria-label={`Move ${label} down`}
                    disabled={!editing || index === order.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={randomize} disabled={pending}>
              <Shuffle aria-hidden className="size-4" />
              Randomize order
            </Button>
            <Button onClick={save} disabled={pending || !dirty}>
              Save order
            </Button>
            {dirty && (
              <Button variant="secondary" onClick={discard} disabled={pending}>
                Discard
              </Button>
            )}
          </div>
          <p className="text-sm text-fog-400">
            {dirty ? "Not saved. Everyone else still sees the saved order." : "Saved. Everyone in the league sees this order."}
          </p>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
