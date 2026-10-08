import { managerInitials } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

const SEAT_BG = ["bg-seat-1", "bg-seat-2", "bg-seat-3", "bg-seat-4"];
const SIZES = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-12 text-lg" };

export function ManagerAvatar({
  manager,
  size = "md",
  className = "",
}: {
  manager: Manager;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${SEAT_BG[manager.seat % SEAT_BG.length]} ${SIZES[size]} ${className}`}
    >
      {managerInitials(manager)}
    </span>
  );
}
