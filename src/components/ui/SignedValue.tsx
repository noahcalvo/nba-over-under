import type { ReactNode } from "react";
import { formatSigned, NOT_AVAILABLE } from "@/lib/format";

export function SignedValue({
  value,
  digits = 1,
  empty = NOT_AVAILABLE,
  className = "",
}: {
  value: number | null;
  digits?: number;
  /** Shown when value is null. */
  empty?: ReactNode;
  className?: string;
}) {
  if (value === null) return <span className={`text-fog-400 ${className}`}>{empty}</span>;
  const text = formatSigned(value, digits);
  const tone = text.startsWith("+") ? "text-positive" : text.startsWith("−") ? "text-negative" : "text-fog-300";
  return <span className={`tabular-nums ${tone} ${className}`}>{text}</span>;
}
