import type { Side } from "@/lib/types";

const STYLES: Record<Side, string> = {
  OVER: "border-over/70 bg-over-deep text-over",
  UNDER: "border-under/70 bg-under-deep text-under-ink",
};

export function SidePill({ side, size = "md", className = "" }: { side: Side; size?: "sm" | "md"; className?: string }) {
  const sizing = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-display font-bold tracking-wide ${sizing} ${STYLES[side]} ${className}`}
    >
      {side}
    </span>
  );
}
