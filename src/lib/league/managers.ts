import type { Manager } from "@/lib/types";

/** A manager's lasting number: 3 for "m3". It doesn't change when the draft order does (falls back to the seat). */
export function managerNumber(manager: Pick<Manager, "id" | "seat">): number {
  const match = /^m(\d+)$/.exec(manager.id);
  return match ? Number(match[1]) : manager.seat + 1;
}

export function managerLabel(manager: Pick<Manager, "id" | "seat" | "displayName">): string {
  return manager.displayName ?? `Manager ${managerNumber(manager)}`;
}

export function managerInitials(manager: Pick<Manager, "id" | "seat">): string {
  return `M${managerNumber(manager)}`;
}

export function findManager(managers: readonly Manager[], id: string | null | undefined): Manager | undefined {
  return id ? managers.find((manager) => manager.id === id) : undefined;
}

export function openSeats(managers: readonly Manager[]): Manager[] {
  return managers.filter((manager) => manager.displayName === null);
}
