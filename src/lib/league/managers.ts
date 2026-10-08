import type { Manager } from "@/lib/types";

export function managerLabel(manager: Pick<Manager, "seat" | "displayName">): string {
  return manager.displayName ?? `Manager ${manager.seat + 1}`;
}

export function managerInitials(manager: Pick<Manager, "seat">): string {
  return `M${manager.seat + 1}`;
}

export function findManager(managers: readonly Manager[], id: string | null | undefined): Manager | undefined {
  return id ? managers.find((manager) => manager.id === id) : undefined;
}

export function openSeats(managers: readonly Manager[]): Manager[] {
  return managers.filter((manager) => manager.displayName === null);
}
