import type { Manager } from "@/lib/types";

// The draft order before the draft starts. managers.seat is the order: round 1 picks in seat order and the snake
// reverses from there (src/lib/draft.ts). Reordering only renumbers seats; ids, names, links and sessions stay with
// their manager.

/** An untrusted request body's `order` as a list of manager ids, or null. Whether it fits the league is isDraftOrderFor's job. */
export function parseDraftOrder(input: unknown): string[] | null {
  if (!input || typeof input !== "object") return null;
  const { order } = input as Record<string, unknown>;
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string")) return null;
  return order as string[];
}

/** True when the order names every manager exactly once. */
export function isDraftOrderFor(managers: readonly Pick<Manager, "id">[], order: readonly string[]): boolean {
  if (order.length !== managers.length) return false;
  const known = new Set(managers.map((manager) => manager.id));
  return new Set(order).size === order.length && order.every((id) => known.has(id));
}

/** The managers in the order, each seat renumbered to its position. Check isDraftOrderFor first. */
export function applyDraftOrder(managers: readonly Manager[], order: readonly string[]): Manager[] {
  return order.map((id, seat) => ({ ...managers.find((manager) => manager.id === id)!, seat }));
}

/** A copy of the order with the item at `from` moved to `to` (0-based; `to` is clamped, a bad `from` changes nothing). */
export function moveInOrder<T>(order: readonly T[], from: number, to: number): T[] {
  const next = [...order];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

const UINT32_RANGE = 2 ** 32;

/** A uniform integer in [0, bound) from crypto.getRandomValues. Draws past the last whole multiple of bound are
 * redrawn, so no value is favoured (no modulo bias). */
export function secureRandomIndex(bound: number): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_RANGE) {
    throw new RangeError(`bound must be an integer from 1 to 2^32, got ${bound}`);
  }
  const limit = Math.floor(UINT32_RANGE / bound) * bound;
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0] < limit) return draw[0] % bound;
  }
}

/** Fisher–Yates: a new array in random order, every order equally likely when randomIndex is uniform. */
export function shuffled<T>(items: readonly T[], randomIndex: (bound: number) => number = secureRandomIndex): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
