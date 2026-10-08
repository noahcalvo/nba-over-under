import { formatSigned, NOT_AVAILABLE } from "@/lib/format";
import type { FadeEvaluation } from "@/lib/scoring";

export type StatusTone = "accent" | "danger" | "neutral";

export interface FadeStatus {
  label: string;
  tone: StatusTone;
}

export function fadeStatus(evaluation: FadeEvaluation): FadeStatus {
  if (evaluation.status === "not_available") return { label: NOT_AVAILABLE, tone: "neutral" };
  if (evaluation.status === "pending") return { label: "Pending", tone: "neutral" };
  if (evaluation.basis === "projected") {
    return evaluation.targetMissed ? { label: "On track", tone: "accent" } : { label: "Off track", tone: "danger" };
  }
  return evaluation.targetMissed
    ? { label: `${formatSigned(evaluation.points ?? 0, 0)} earned`, tone: "accent" }
    : { label: "No bonus", tone: "neutral" };
}
