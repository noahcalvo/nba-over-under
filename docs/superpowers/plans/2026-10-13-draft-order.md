# Commissioner Draft Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the draft starts, the commissioner can reorder the managers (drag and drop, or move up/down) and randomize the order; the saved order is what round 1 of the existing snake draft uses, everyone in the league sees it, and the server locks it once the draft starts.

**Architecture:** The draft order already exists: `managers.seat` is a 0-based draft position (`Manager.seat` — "round 1 picks in seat order"), `loadLeague` reads managers ordered by seat, and `DraftState.seatOrder` is derived from it. So this feature adds **no new state and no migration**: a new pure decision `decideDraftOrder` renumbers seats, `saveLeague` learns to persist seat changes (two-phase, because `managers_seat_unique` is not deferrable), and `PUT /api/leagues/{id}/order` runs it under `withLockedLeague` like every other mutation. Start, snake turns, permissions and scoring are untouched — they already read `seatOrder`. In the UI the draft lobby's manager grid becomes a numbered "Draft order" list for everyone; the commissioner's copy is editable with Save / Discard, exactly like the league size form and line review next to it.

**Tech Stack:** Next.js 16.4 App Router (Cache Components), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM 0.45 (Postgres / PGlite), Vitest 4.1, lucide-react. No new dependencies.

**Spec:** the Requirements section below (the request of 2026-10-13) plus `docs/superpowers/specs/2026-10-08-courtline-prototype-design.md` for the draft rules this extends. Read `CLAUDE.md` first: it is the project's rulebook.

## Requirements

Manual order
- Before drafting begins the commissioner rearranges managers into a draft order. Drag and drop, with accessible alternatives (move up / move down buttons, keyboard, screen-reader announcements).
- Numbered draft positions are clearly displayed.
- Changes persist in the database and are visible to every league member.
- The order is round 1 of the existing snake draft; later rounds reverse automatically (unchanged rule).
- Reordering never changes manager identities, ownership, invitations or sessions.

Randomize
- A "Randomize order" button next to the manual controls produces an unbiased permutation of all managers (open seats included).
- The result shows immediately; the commissioner can randomize again or adjust it by hand.
- It is clear whether changes are saved: explicit **Save order / Discard**, the same interaction as League size and line review.

Permissions and lifecycle
- Only the commissioner modifies or randomizes. Everyone (members and spectators) sees the order.
- Only while the draft is `not_started`; afterwards the server refuses (`order_locked`).
- The draft starts from the saved order, never from manager creation or join order.

UI
- In the draft lobby (where League size and the manager list already live). Courtline's design system. Editable (commissioner, pre-draft) is visibly different from read-only (everyone else) and from locked (after the start the order is the draft board's columns).
- Works for 2–12 managers.

## Relevant existing architecture

| What | Where | Notes |
| --- | --- | --- |
| Draft position | `src/db/schema.ts` `managers.seat` (smallint, `unique (league_id, seat)` = `managers_seat_unique`) | The order. Nothing references `seat` by foreign key; links, sessions, picks and fades reference `managers.id`. |
| Order as loaded | `src/db/leagues.ts` `loadParts` (`orderBy(asc(managers.seat))`) and `assemble` (`seatOrder: roster.map(m => m.id)`) | Reload already returns the saved order. |
| Writes | `src/db/leagues.ts` `saveLeague`, `withLockedLeague` | `saveLeague` adds/removes seats and renames but never updates `seat` today. |
| Snake turns | `src/lib/draft.ts` `seatForPick`, `managerOnTheClock`, `createDraftState` | Read `state.seatOrder`; unchanged. |
| Start | `src/lib/league/commands.ts` `decideDraftAction` → `applyDraftAction` | Uses `league.draft.seatOrder`; unchanged. |
| League size | `src/lib/league/config.ts` `resizeSeats`, `minManagerCount`; `decideLeagueConfig`; `PUT /api/leagues/{id}/config`; `src/components/draft/LeagueSizeForm.tsx` | The pattern to copy. `resizeSeats` names new seats `m{seat + 1}`, which **collides** once seats are reordered (fixed in Task 2). |
| Permissions | `src/lib/league/permissions.ts` `canControlDraft` | Commissioner by `commissionerId` (`m1`), never by seat. |
| Errors | `src/lib/league/errors.ts` (`DomainError`, `ERROR_MESSAGES`), `src/server/http.ts` (`STATUS`) | Add `order_locked`, `invalid_order`. |
| Client | `src/components/draft/use-league-draft.ts` (driver, polling every 2 s, `send`), `DraftRoomView.tsx` (`DraftRoomDriver`, `startBlocker`), `DraftLobby.tsx` | Tutorial driver: `src/components/tutorial/use-tutorial-session.ts`. |
| Identity display | `src/lib/league/managers.ts` `managerLabel` ("Manager {seat + 1}"), `managerInitials` ("M{seat + 1}"); `src/components/ui/ManagerAvatar.tsx` (color `bg-seat-{seat + 1}`) | Derived from the **position**: reordering would rename open seats and recolor avatars. Task 5 keys them on the id instead. |
| Tests | `src/lib/league/*.test.ts`, `src/db/actions.test.ts` (PGlite), `src/db/concurrency.pg.test.ts` (real Postgres), `scripts/smoke.sh` | No component tests in the repo; UI is verified in the browser. |

## Proposed UX and data flow

Draft lobby (`/l/{id}/draft`, status `not_started`), replacing the current manager grid:

```
Draft order                                   [Unsaved changes]   ← badge only when the local order differs
Round 1 picks top to bottom; round 2 runs bottom to top, and so on.
┌──────────────────────────────────────────────────────────────┐
│ ⋮⋮  1  (M3) Manager 3        Open seat              [↑] [↓]   │
│ ⋮⋮  2  (AN) Ana  You         Commissioner           [↑] [↓]   │
│ ⋮⋮  3  (BE) Ben              Joined                 [↑] [↓]   │
│ ⋮⋮  4  (M4) Manager 4        Open seat              [↑] [↓]   │
└──────────────────────────────────────────────────────────────┘
[🔀 Randomize order]  [Save order]  [Discard]
Unsaved. Everyone else still sees the saved order.   /   Saved. Everyone in the league sees this order.
```

- Commissioner: drag a row (native HTML5 drag and drop, desktop pointers), or use the ↑ / ↓ buttons (touch, keyboard,
  screen readers; each move is announced in a polite live region). "Randomize order" shuffles the **local** order
  (Fisher–Yates over `crypto.getRandomValues`). Nothing is sent until **Save order**; **Discard** returns to the saved
  order. While unsaved, Start is blocked with "Save or discard your draft order change first." (same as league size).
- Everyone else: the same numbered list without handles or buttons, with "Set by the commissioner. It can change until
  the draft starts." Polling (2 s) shows the commissioner's saved changes.
- After the start: the lobby is gone; the draft board's columns are the locked order (already rendered from
  `seatOrder`). The server answers any reorder with `order_locked` (409).

Data flow: `DraftOrderPanel` → `driver.saveDraftOrder(order)` → `PUT /api/leagues/{id}/order` `{ order: string[] }` →
`parseDraftOrder` (400 `invalid_request` on a malformed body) → `setDraftOrder` → `withLockedLeague` →
`decideDraftOrder` (demo → `demo_league`, not commissioner → `forbidden`, started → `order_locked`, not exactly the
league's manager ids → `invalid_order`) → `saveLeague` renumbers seats (version + 1) → `LeagueView` returned; other
viewers pick it up on their next poll.

## Decisions for approval (recommendations in bold)

1. **Store the order in the existing `managers.seat`; no new column, no migration.** Alternative: a `draft_order` jsonb
   on `leagues` — a second source of truth that `seatOrder`, rosters and standings would have to agree with.
2. **Explicit Save / Discard; Randomize only changes the local, unsaved order.** Matches League size and line review,
   lets the commissioner randomize repeatedly and tweak before anyone sees it. Alternative: auto-save on every move
   (more writes, other managers watch the order jump around, and Start would race in-flight saves).
3. **Native HTML5 drag and drop + ↑/↓ buttons, no new dependency.** Native DnD doesn't fire on touch screens, so phones
   use the buttons (fine for ≤ 12 rows). Alternative: add `@dnd-kit/core` + `@dnd-kit/sortable` for touch dragging.
4. **Randomize runs in the commissioner's browser.** Since the commissioner may set any order by hand anyway, a
   server-side shuffle adds no fairness guarantee members could verify. (A verifiable/audited "randomized at" record is
   out of scope.)
5. **Labels, initials and avatar colors follow the manager id (`m3` → "Manager 3", "M3", seat color 3), not the
   position.** Otherwise moving an open seat renames it and every reorder recolors avatars — identities would appear to
   change. For leagues never reordered (every existing league) nothing changes, because `id = m{seat + 1}`.
6. **Consequences we accept:** rosters, team-page owner lists and the standings tie-break already sort by `seat`, so
   they follow the draft order (they are locked with it). Shrinking still removes seats from the **end of the draft
   order** and only open ones, so a claimed seat moved last blocks shrinking until it is moved; new seats take the
   smallest unused id `m{n}`. Saving a new league size while an order edit is unsaved resets that edit to the
   server's order.
7. **No separate "locked order" panel after the start:** the draft board's columns are the order. (Ask if you want a
   small "Draft order · locked" strip in the status bar.)

## Global Constraints

- `src/lib/` stays pure (no React, no `next/*`, no `server-only`) and test-first; tests colocated as `*.test.ts`.
- Every league write goes through `withLockedLeague` (`src/db/leagues.ts`) with a pure decision from
  `src/lib/league/commands.ts`. Never authorize with `getViewerId()`.
- Do not change snake rules (`seatForPick`), start, picks, fades or scoring. No new dependencies. No schema change, so
  no `drizzle/` files.
- The commissioner is `commissionerId` (`m1`) wherever they sit in the order.
- UI: dark theme tokens only (`bg-ink-900`, `text-fog-400`, `text-accent`, …), lucide-react icons, `Button` from
  `src/components/ui/Button.tsx`, no page-level horizontal scroll at 375px and 1440px.
- If `npm run typecheck` fails on files named `* 2.*` under `.next/`, delete those iCloud duplicates; they are not ours.
- Before claiming a task done: `npm test && npm run lint && npm run typecheck` (and `npm run build` in the last task).
- One commit per task; messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Stale order after a size change** (commissioner saves an order from a tab that hasn't seen a resize): expect
   `invalid_order` (409), nothing written, and the editor resets to the server's order. Pinned in Tasks 3 and 4.
2. **Growing the league after a reorder** (e.g. order `m4,m1,m2`, then 4 managers): expect a fresh unused id (`m3`),
   never a duplicate primary key. Pinned in Tasks 2 and 4.
3. **Reorder racing Start** (two requests at once): expect one serial order — either the draft starts with the new
   order or the reorder fails with `order_locked`; never a live draft whose stored seats differ from `seatOrder`.
   Pinned in Task 4 (`concurrency.pg.test.ts`) and Task 3 (paused, fades, complete, and a state with picks).
4. **Malformed bodies** (missing `order`, non-strings, duplicates, unknown ids, wrong length): expect 400 / 409 and no
   write. Pinned in Tasks 1, 3, 4 and the smoke test.
5. **A seat claimed while the commissioner is mid-edit** (polling delivers a new name): expect the unsaved order kept and
   the new name shown in its row. The panel is keyed by the saved order only; checked in the Task 6 browser pass.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/league/draft-order.ts` | create | `parseDraftOrder`, `isDraftOrderFor`, `applyDraftOrder`, `moveInOrder`, `secureRandomIndex`, `shuffled` |
| `src/lib/league/draft-order.test.ts` | create | Tests for the above, including permutation validity and uniformity |
| `src/lib/league/config.ts` | modify | `resizeSeats` gives new seats the smallest unused `m{n}` id |
| `src/lib/league/config.test.ts` | modify | Resize after a reorder |
| `src/lib/league/errors.ts` | modify | `order_locked`, `invalid_order` + messages |
| `src/server/http.ts` | modify | Statuses for the new errors (409) |
| `src/lib/league/commands.ts` | modify | `decideDraftOrder` |
| `src/lib/league/commands.test.ts` | modify | Decision, permissions, lifecycle, start uses the order, snake |
| `src/db/leagues.ts` | modify | `saveLeague` persists seat changes (two-phase) |
| `src/db/actions.ts` | modify | `setDraftOrder` |
| `src/db/actions.test.ts` | modify | Persistence after reload, identities kept, refusals write nothing, resize after reorder |
| `src/db/concurrency.pg.test.ts` | modify | Reorder vs start, parallel reorders, reorder vs claim |
| `src/app/api/leagues/[leagueId]/order/route.ts` | create | `PUT` handler |
| `scripts/smoke.sh` | modify | Reorder checks over HTTP |
| `src/lib/league/managers.ts` (+ test) | modify | `managerNumber`; label and initials follow the id |
| `src/components/ui/ManagerAvatar.tsx` | modify | Color follows the id |
| `src/components/access/LinkClaimForm.tsx` | modify | Open-seat wording without "Seat {position}" |
| `src/components/draft/DraftOrderPanel.tsx` | create | Numbered list; commissioner editor (drag, ↑/↓, randomize, save, discard) |
| `src/components/draft/DraftLobby.tsx` | modify | Uses `DraftOrderPanel` instead of the manager grid |
| `src/components/draft/DraftRoomView.tsx` | modify | `DraftRoomDriver.saveDraftOrder`, `orderDirty` start blocker |
| `src/components/draft/use-league-draft.ts` | modify | `saveDraftOrder` → `PUT …/order` |
| `src/components/tutorial/use-tutorial-session.ts` | modify | `saveDraftOrder: async () => false` |
| `CLAUDE.md` | modify | Draft-order rule; commissioner wording |

Suggested models (per the repo workflow): Tasks 1–3 and 5 have complete code → haiku. Task 4 (database) → haiku,
escalate to sonnet if the two-phase update fights the constraint. Task 6 (UI + browser check) → sonnet.

---

### Task 1: Draft-order rules (pure)

**Files:**
- Create: `src/lib/league/draft-order.ts`
- Test: `src/lib/league/draft-order.test.ts`

**Interfaces:**
- Consumes: `Manager` from `src/lib/types.ts`; `seededRandom` from `src/lib/random.ts` (tests only).
- Produces:
  - `parseDraftOrder(input: unknown): string[] | null`
  - `isDraftOrderFor(managers: readonly Pick<Manager, "id">[], order: readonly string[]): boolean`
  - `applyDraftOrder(managers: readonly Manager[], order: readonly string[]): Manager[]`
  - `moveInOrder<T>(order: readonly T[], from: number, to: number): T[]`
  - `secureRandomIndex(bound: number): number`
  - `shuffled<T>(items: readonly T[], randomIndex?: (bound: number) => number): T[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/league/draft-order.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDraftOrder,
  isDraftOrderFor,
  moveInOrder,
  parseDraftOrder,
  secureRandomIndex,
  shuffled,
} from "@/lib/league/draft-order";
import { seededRandom } from "@/lib/random";
import type { Manager } from "@/lib/types";

const MANAGERS: Manager[] = [
  { id: "m1", seat: 0, displayName: "Ana" },
  { id: "m2", seat: 1, displayName: "Ben" },
  { id: "m3", seat: 2, displayName: null },
  { id: "m4", seat: 3, displayName: null },
];

const ids = (count: number) => Array.from({ length: count }, (_, i) => `m${i + 1}`);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseDraftOrder", () => {
  it("reads a list of strings from the body's order", () => {
    expect(parseDraftOrder({ order: ["m2", "m1"] })).toEqual(["m2", "m1"]);
  });

  it("refuses anything else", () => {
    expect(parseDraftOrder(null)).toBeNull();
    expect(parseDraftOrder("m1,m2")).toBeNull();
    expect(parseDraftOrder({})).toBeNull();
    expect(parseDraftOrder({ order: "m1" })).toBeNull();
    expect(parseDraftOrder({ order: ["m1", 2] })).toBeNull();
    expect(parseDraftOrder({ order: [null] })).toBeNull();
  });
});

describe("isDraftOrderFor", () => {
  it("accepts every manager exactly once, in any order", () => {
    expect(isDraftOrderFor(MANAGERS, ["m3", "m1", "m4", "m2"])).toBe(true);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m4"])).toBe(true);
  });

  it("refuses missing, duplicate, unknown and extra ids", () => {
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m1", "m3", "m4"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m9"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, ["m1", "m2", "m3", "m4", "m5"])).toBe(false);
    expect(isDraftOrderFor(MANAGERS, [])).toBe(false);
  });
});

describe("applyDraftOrder", () => {
  it("renumbers seats to the order and keeps each manager's id and name", () => {
    expect(applyDraftOrder(MANAGERS, ["m3", "m1", "m4", "m2"])).toEqual([
      { id: "m3", seat: 0, displayName: null },
      { id: "m1", seat: 1, displayName: "Ana" },
      { id: "m4", seat: 2, displayName: null },
      { id: "m2", seat: 3, displayName: "Ben" },
    ]);
  });

  it("does not change its input", () => {
    applyDraftOrder(MANAGERS, ["m4", "m3", "m2", "m1"]);
    expect(MANAGERS.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });
});

describe("moveInOrder", () => {
  it("moves one item and shifts the rest", () => {
    expect(moveInOrder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveInOrder(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c", "d"], 1, 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps the target and ignores an out-of-range source", () => {
    expect(moveInOrder(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveInOrder(["a", "b", "c"], 2, -1)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
  });
});

describe("secureRandomIndex", () => {
  it("stays in [0, bound)", () => {
    for (const bound of [1, 2, 3, 7, 12]) {
      for (let i = 0; i < 500; i++) {
        const value = secureRandomIndex(bound);
        expect(Number.isInteger(value) && value >= 0 && value < bound).toBe(true);
      }
    }
  });

  it("rejects draws from the uneven tail instead of folding them (no modulo bias)", () => {
    // For bound 3 the accepted range is [0, 4294967295); 0xffffffff is the one rejected value.
    const draws = [0xffffffff, 5];
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array[0] = draws.shift()!;
      return array;
    }) as typeof crypto.getRandomValues);
    expect(secureRandomIndex(3)).toBe(2);
    expect(draws).toEqual([]);
  });

  it("refuses bounds that aren't positive integers", () => {
    expect(() => secureRandomIndex(0)).toThrow(RangeError);
    expect(() => secureRandomIndex(2.5)).toThrow(RangeError);
  });
});

describe("shuffled", () => {
  it("returns a permutation: same items, none missing or duplicated, input untouched", () => {
    for (let count = 2; count <= 12; count++) {
      const order = ids(count);
      for (let run = 0; run < 50; run++) {
        const result = shuffled(order);
        expect(result).toHaveLength(count);
        expect(new Set(result).size).toBe(count);
        expect([...result].sort()).toEqual([...order].sort());
      }
      expect(order).toEqual(ids(count));
    }
  });

  it("is Fisher–Yates: asks for one index per position, from n down to 2", () => {
    const bounds: number[] = [];
    shuffled(ids(5), (bound) => {
      bounds.push(bound);
      return 0;
    });
    expect(bounds).toEqual([5, 4, 3, 2]);
  });

  it("makes every order of three managers about equally likely", () => {
    const random = seededRandom(20261013);
    const randomIndex = (bound: number) => Math.floor(random() * bound);
    const counts = new Map<string, number>();
    const runs = 60_000;
    for (let i = 0; i < runs; i++) {
      const key = shuffled(["a", "b", "c"], randomIndex).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // Expected 10 000 each; the standard deviation is about 91, so ±600 is more than 6σ.
    for (const count of counts.values()) expect(Math.abs(count - runs / 6)).toBeLessThan(600);
  });

  it("leaves a single manager alone", () => {
    expect(shuffled(["m1"])).toEqual(["m1"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/league/draft-order.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/league/draft-order"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/league/draft-order.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/league/draft-order.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

```bash
git add src/lib/league/draft-order.ts src/lib/league/draft-order.test.ts
git commit -m "feat: draft-order rules: parse, validate, reorder and unbiased shuffle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New seats never reuse a taken id

Today `resizeSeats` names a new seat `m{seat + 1}`. Once seats are reordered that id may already belong to someone
(order `m4, m1, m2` → growing to 4 would add a second `m4`). New seats take the smallest unused `m{n}` instead; for a
league that was never reordered this is the same id as before.

**Files:**
- Modify: `src/lib/league/config.ts:44-49`
- Test: `src/lib/league/config.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resizeSeats(managers, managerCount): Manager[]` — same signature; new seats get the smallest unused id.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/league/config.test.ts` (add `resizeSeats` and `Manager` to the imports if they aren't there):

```ts
describe("resizeSeats after a reorder", () => {
  const reordered: Manager[] = [
    { id: "m4", seat: 0, displayName: null },
    { id: "m1", seat: 1, displayName: "Ana" },
    { id: "m2", seat: 2, displayName: null },
    { id: "m3", seat: 3, displayName: null },
  ];

  it("drops from the end of the draft order", () => {
    expect(resizeSeats(reordered, 3).map((m) => m.id)).toEqual(["m4", "m1", "m2"]);
  });

  it("gives new seats the smallest unused ids, never a taken one", () => {
    const shrunk = resizeSeats(reordered, 3);
    expect(resizeSeats(shrunk, 5)).toEqual([
      { id: "m4", seat: 0, displayName: null },
      { id: "m1", seat: 1, displayName: "Ana" },
      { id: "m2", seat: 2, displayName: null },
      { id: "m3", seat: 3, displayName: null },
      { id: "m5", seat: 4, displayName: null },
    ]);
  });

  it("keeps ids unique at every size from 2 to 12", () => {
    for (let count = 2; count <= 12; count++) {
      const seats = resizeSeats(reordered, count);
      expect(new Set(seats.map((m) => m.id)).size).toBe(count);
      expect(seats.map((m) => m.seat)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/league/config.test.ts`
Expected: FAIL in "gives new seats the smallest unused ids" (gets a second `m4`).

- [ ] **Step 3: Implement**

Replace `resizeSeats` in `src/lib/league/config.ts`:

```ts
/**
 * Seats for a new size: existing seats kept in draft order, trailing seats dropped, new open seats added at the end.
 * A new seat takes the smallest unused id `m{n}` (seats can be reordered, so `m{seat + 1}` may be taken).
 */
export function resizeSeats(managers: readonly Manager[], managerCount: number): Manager[] {
  const kept = [...managers].sort((a, b) => a.seat - b.seat).slice(0, managerCount);
  const taken = new Set(kept.map((manager) => manager.id));
  let next = 1;
  for (let seat = kept.length; seat < managerCount; seat++) {
    while (taken.has(`m${next}`)) next++;
    taken.add(`m${next}`);
    kept.push({ id: `m${next}`, seat, displayName: null });
  }
  return kept;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/league/config.test.ts src/lib/league/commands.test.ts`
Expected: PASS (the existing `decideLeagueConfig` tests still get `m5`, `m6`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/league/config.ts src/lib/league/config.test.ts
git commit -m "fix: new seats take the smallest unused manager id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `decideDraftOrder` and its errors

**Files:**
- Modify: `src/lib/league/errors.ts` (`DomainError`, `ERROR_MESSAGES`)
- Modify: `src/server/http.ts` (`STATUS`)
- Modify: `src/lib/league/commands.ts`
- Test: `src/lib/league/commands.test.ts`

**Interfaces:**
- Consumes: `isDraftOrderFor`, `applyDraftOrder` (Task 1); `canControlDraft` (existing).
- Produces: `decideDraftOrder(league: League, actorId: string | null, order: readonly string[]): Result<League>`;
  `DomainError` gains `"order_locked" | "invalid_order"`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/league/commands.test.ts`, add `decideDraftOrder` to the `@/lib/league/commands` import and
`seatForPick` to the `@/lib/draft` import, then append:

```ts
describe("decideDraftOrder", () => {
  const ORDER = ["m3", "m1", "m4", "m2"];

  it("renumbers seats to the order and keeps every id and name", () => {
    const league = must(decideDraftOrder(join(newLeague(), "m2", "Ben"), "m1", ORDER));
    expect(league.managers.map((m) => [m.id, m.seat, m.displayName])).toEqual([
      ["m3", 0, null],
      ["m1", 1, "Ana"],
      ["m4", 2, null],
      ["m2", 3, "Ben"],
    ]);
    expect(league.draft).toMatchObject({ status: "not_started", seatOrder: ORDER, picks: [], rounds: 11 });
    expect(league.commissionerId).toBe("m1");
  });

  it("can be changed again, or put back", () => {
    const once = must(decideDraftOrder(newLeague(), "m1", ORDER));
    const back = must(decideDraftOrder(once, "m1", ["m1", "m2", "m3", "m4"]));
    expect(back.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(back.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });

  it("starts the draft from the saved order and snakes from there", () => {
    const league = must(decideDraftOrder(newLeague(), "m1", ORDER));
    const started = must(act(league, "m1", { type: "start" }));
    expect(started.draft.seatOrder).toEqual(ORDER);
    expect(managerOnTheClock(started.draft)).toBe("m3");
    const order = started.draft.seatOrder;
    expect(Array.from({ length: 8 }, (_, i) => order[seatForPick(i + 1, order.length)])).toEqual([
      "m3", "m1", "m4", "m2", // round 1
      "m2", "m4", "m1", "m3", // round 2 reverses
    ]);
    const afterOne = must(act(started, "m1", pick(started, "MIN", "OVER")));
    expect(afterOne.draft.picks[0].managerId).toBe("m3");
    expect(managerOnTheClock(afterOne.draft)).toBe("m1");
  });

  it("refuses orders that aren't exactly the league's managers", () => {
    const league = newLeague();
    for (const order of [["m1", "m2", "m3"], ["m1", "m1", "m3", "m4"], ["m1", "m2", "m3", "m9"], []]) {
      expect(decideDraftOrder(league, "m1", order)).toEqual({ ok: false, error: "invalid_order" });
    }
  });

  it("refuses an order made before the league size changed", () => {
    const grown = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 6, rounds: 10 }));
    expect(decideDraftOrder(grown, "m1", ORDER)).toEqual({ ok: false, error: "invalid_order" });
  });

  it("belongs to the commissioner, and never to the demo league", () => {
    const league = join(newLeague(), "m2", "Ben");
    expect(decideDraftOrder(league, "m2", ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(decideDraftOrder(league, null, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(decideDraftOrder({ ...league, isDemo: true }, "m1", ORDER)).toEqual({ ok: false, error: "demo_league" });
  });

  it("is locked once the draft starts: live, paused, fades and complete", () => {
    const started = must(act(newLeague(), "m1", { type: "start" }));
    expect(decideDraftOrder(started, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    const paused = must(act(started, "m1", { type: "pause" }));
    expect(decideDraftOrder(paused, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    for (const status of ["fades", "complete"] as const) {
      const later = { ...started, draft: { ...started.draft, status } };
      expect(decideDraftOrder(later, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
    }
  });

  it("never reorders a draft that has picks, whatever its status says", () => {
    const started = must(act(newLeague(), "m1", { type: "start" }));
    const picked = must(act(started, "m1", pick(started, "MIN", "OVER")));
    const inconsistent = { ...picked, draft: { ...picked.draft, status: "not_started" as const } };
    expect(decideDraftOrder(inconsistent, "m1", ORDER)).toEqual({ ok: false, error: "order_locked" });
  });

  it("works at 2 and 12 managers", () => {
    const two = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 2, rounds: 30 }));
    expect(must(decideDraftOrder(two, "m1", ["m2", "m1"])).draft.seatOrder).toEqual(["m2", "m1"]);
    const twelve = must(decideLeagueConfig(newLeague(), "m1", { managerCount: 12, rounds: 5 }));
    const reversed = [...twelve.draft.seatOrder].reverse();
    expect(must(decideDraftOrder(twelve, "m1", reversed)).draft.seatOrder).toEqual(reversed);
  });

  it("lets the league grow after a reorder without reusing an id", () => {
    const reordered = must(decideDraftOrder(newLeague(), "m1", ["m4", "m1", "m2", "m3"]));
    const shrunk = must(decideLeagueConfig(reordered, "m1", { managerCount: 3, rounds: 11 }));
    expect(shrunk.draft.seatOrder).toEqual(["m4", "m1", "m2"]);
    const grown = must(decideLeagueConfig(shrunk, "m1", { managerCount: 5, rounds: 11 }));
    expect(grown.draft.seatOrder).toEqual(["m4", "m1", "m2", "m3", "m5"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/league/commands.test.ts`
Expected: FAIL — `decideDraftOrder` is not exported.

- [ ] **Step 3: Add the errors**

In `src/lib/league/errors.ts`, add to `DomainError` after `"seats_claimed"`:

```ts
  | "order_locked"
  | "invalid_order"
```

and to `ERROR_MESSAGES` after `seats_claimed`:

```ts
  order_locked: "Draft order is locked once the draft starts.",
  invalid_order: "The seats changed since you set this order. Check it and save again.",
```

In `src/server/http.ts` `STATUS`, after `seats_claimed: 409,`:

```ts
  order_locked: 409,
  invalid_order: 409,
```

- [ ] **Step 4: Implement the decision**

In `src/lib/league/commands.ts`, import `applyDraftOrder, isDraftOrderFor` from `@/lib/league/draft-order` and add after
`decideLeagueConfig`:

```ts
/**
 * Sets the draft order before the draft: `order` lists every manager id once, round 1 first. Seats are renumbered;
 * ids, names, links and sessions stay with their manager. Commissioner only. Parse the request with parseDraftOrder first.
 */
export function decideDraftOrder(league: League, actorId: string | null, order: readonly string[]): Result<League> {
  if (league.isDemo) return fail("demo_league");
  if (!canControlDraft(league, actorId)) return fail("forbidden");
  const { draft } = league;
  if (draft.status !== "not_started" || draft.picks.length > 0 || draft.voidedPicks.length > 0) {
    return fail("order_locked");
  }
  if (!isDraftOrderFor(league.managers, order)) return fail("invalid_order");
  return succeed({ ...league, managers: applyDraftOrder(league.managers, order), draft: { ...draft, seatOrder: [...order] } });
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/league`
Expected: PASS.

- [ ] **Step 6: Typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: no errors (`STATUS` is `Record<ApiError, number>`, so a missing status would fail here).

```bash
git add src/lib/league/errors.ts src/server/http.ts src/lib/league/commands.ts src/lib/league/commands.test.ts
git commit -m "feat: decideDraftOrder: commissioner sets the draft order before the start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Persist the order, `setDraftOrder`, the API route and smoke checks

**Files:**
- Modify: `src/db/leagues.ts` (`saveLeague`)
- Modify: `src/db/actions.ts`
- Create: `src/app/api/leagues/[leagueId]/order/route.ts`
- Test: `src/db/actions.test.ts`, `src/db/concurrency.pg.test.ts`, `scripts/smoke.sh`

**Interfaces:**
- Consumes: `decideDraftOrder` (Task 3), `parseDraftOrder` (Task 1).
- Produces: `setDraftOrder(db: Db, leagueId: string, sessionId: string | null, order: readonly string[]): Promise<Result<DraftOutcome>>`;
  `PUT /api/leagues/{leagueId}/order` with body `{ "order": string[] }` → `LeagueView` (200) or `{ error, message }`.

- [ ] **Step 1: Write the failing database tests**

In `src/db/actions.test.ts` add `setDraftOrder` to the `@/db/actions` import, then append:

```ts
describe("draft order", () => {
  const ORDER = ["m3", "m1", "m4", "m2"];

  it("persists after a reload and bumps the version", async () => {
    expect((await setDraftOrder(db, LEAGUE, ana, ORDER)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.map((m) => [m.id, m.seat])).toEqual([["m3", 0], ["m1", 1], ["m4", 2], ["m2", 3]]);
    expect(league.draft.seatOrder).toEqual(ORDER);
    expect(league.version).toBe(2);
  });

  it("keeps names, sessions and links with their manager, and open seats stay claimable", async () => {
    await joinAs(ben, "m2", "Ben");
    const linksBefore = (await listActiveLinks(db, LEAGUE)).map((l) => [l.id, l.kind, l.managerId]);
    expect((await setDraftOrder(db, LEAGUE, ana, ORDER)).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.managers.find((m) => m.id === "m2")?.displayName).toBe("Ben");
    expect(league.commissionerId).toBe("m1");
    expect(await seatInLeague(db, ana, LEAGUE)).toBe("m1");
    expect(await seatInLeague(db, ben, LEAGUE)).toBe("m2");
    expect((await listActiveLinks(db, LEAGUE)).map((l) => [l.id, l.kind, l.managerId])).toEqual(linksBefore);
    expect((await joinAs(cal, "m3", "Cal")).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.managers[0]).toEqual({ id: "m3", seat: 0, displayName: "Cal" });
  });

  it("starts the draft from the saved order", async () => {
    await joinAs(ben, "m2", "Ben");
    await setDraftOrder(db, LEAGUE, ana, ["m2", "m1", "m3", "m4"]);
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await confirm(ana, 1, "MIN", "OVER")).toEqual({ ok: false, error: "forbidden" });
    expect((await confirm(ben, 1, "MIN", "OVER")).ok).toBe(true);
    expect((await confirm(ana, 2, "OKC", "OVER")).ok).toBe(true);
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m2", "m1", "m3", "m4"]);
    expect(league.draft.picks.map((pick) => pick.managerId)).toEqual(["m2", "m1"]);
  });

  it("refuses other managers, spectators, bad orders and a started draft, writing nothing", async () => {
    await joinAs(ben, "m2", "Ben");
    expect(await setDraftOrder(db, LEAGUE, ben, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, cal, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, null, ORDER)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDraftOrder(db, LEAGUE, ana, ["m1", "m1", "m2", "m3"])).toEqual({ ok: false, error: "invalid_order" });
    await runDraftAction(db, LEAGUE, ana, { type: "start" }, STATIC_LINES);
    expect(await setDraftOrder(db, LEAGUE, ana, ORDER)).toEqual({ ok: false, error: "order_locked" });
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.version).toBe(3); // the claim and the start only
  });

  it("refuses an order saved from a screen that missed a size change", async () => {
    await setLeagueConfig(db, LEAGUE, ana, { managerCount: 5, rounds: 11 });
    expect(await setDraftOrder(db, LEAGUE, ana, ORDER)).toEqual({ ok: false, error: "invalid_order" });
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("shrinks from the end of the order and grows with fresh ids after a reorder", async () => {
    await setDraftOrder(db, LEAGUE, ana, ["m4", "m1", "m2", "m3"]);
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 3, rounds: 11 })).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m4", "m1", "m2"]);
    expect((await setLeagueConfig(db, LEAGUE, ana, { managerCount: 5, rounds: 11 })).ok).toBe(true);
    expect((await loadLeague(db, LEAGUE))!.draft.seatOrder).toEqual(["m4", "m1", "m2", "m3", "m5"]);
  });

  it("leaves a league that was never reordered in creation order", async () => {
    const league = (await loadLeague(db, LEAGUE))!;
    expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    expect(league.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/db/actions.test.ts -t "draft order"`
Expected: FAIL — `setDraftOrder` is not exported.

- [ ] **Step 3: Add `setDraftOrder`**

In `src/db/actions.ts`, add `decideDraftOrder` to the commands import and add after `setLeagueConfig`:

```ts
/** Commissioner: set the draft order before the draft. Parse the body with parseDraftOrder before calling. */
export function setDraftOrder(
  db: Db,
  leagueId: string,
  sessionId: string | null,
  order: readonly string[],
): Promise<Result<DraftOutcome>> {
  return withLockedLeague(db, leagueId, sessionId, async ({ tx, league, actorId }) => {
    const decided = decideDraftOrder(league, actorId, order);
    if (!decided.ok) return fail(decided.error);
    return succeed({ league: await saveLeague(tx, league, decided.value), actorId });
  });
}
```

- [ ] **Step 4: Run them — expect the seat write to be missing**

Run: `npx vitest run src/db/actions.test.ts -t "draft order"`
Expected: FAIL in "persists after a reload" — seats come back as `m1..m4` because `saveLeague` never writes `seat`.

- [ ] **Step 5: Persist seat changes in `saveLeague`**

In `src/db/leagues.ts` `saveLeague`, insert this block **after** the `removed` deletion and **before** the `added`
insert, and update the doc comment's list to "(seats, seat order, rounds, …)":

```ts
  // The draft order (decideDraftOrder) renumbers kept seats before the draft. managers_seat_unique isn't deferrable,
  // so moved seats first park on negative numbers (-1 - seat, distinct and never a real seat), then take their seats.
  const moved = after.managers.filter((manager) => {
    const previous = before.managers.find((old) => old.id === manager.id);
    return previous !== undefined && previous.seat !== manager.seat;
  });
  for (const seat of [(manager: Manager) => -1 - manager.seat, (manager: Manager) => manager.seat]) {
    for (const manager of moved) {
      await tx
        .update(managers)
        .set({ seat: seat(manager) })
        .where(and(eq(managers.leagueId, after.id), eq(managers.id, manager.id)));
    }
  }
```

(`Manager` is already imported in this file.)

- [ ] **Step 6: Run the database tests**

Run: `npx vitest run src/db`
Expected: PASS (the `.pg` file is skipped without `TEST_DATABASE_URL`).

- [ ] **Step 7: Add the real-Postgres concurrency tests**

In `src/db/concurrency.pg.test.ts` add `setDraftOrder` to the `@/db/actions` import and append inside the
`describe.skipIf(!url)` block:

```ts
  it("applies a reorder and a start in one order or the other: the draft starts from whatever order is stored", async () => {
    const { leagueId, commissioner } = await newLeague();
    const order = ["m3", "m1", "m4", "m2"];
    const [reordered, started] = await Promise.all([
      setDraftOrder(db, leagueId, commissioner, order),
      runDraftAction(db, leagueId, commissioner, { type: "start" }, STATIC_LINES),
    ]);
    expect(started.ok).toBe(true);
    const league = (await loadLeague(db, leagueId))!;
    expect(league.draft.status).toBe("live");
    if (reordered.ok) {
      expect(league.draft.seatOrder).toEqual(order);
    } else {
      expect(reordered.error).toBe("order_locked");
      expect(league.draft.seatOrder).toEqual(["m1", "m2", "m3", "m4"]);
    }
    expect(league.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
  });

  it("serializes parallel reorders: the last one wins and seats stay a clean 0..n-1", async () => {
    const { leagueId, commissioner } = await newLeague();
    const orders = [
      ["m2", "m1", "m3", "m4"],
      ["m4", "m3", "m2", "m1"],
      ["m3", "m4", "m1", "m2"],
      ["m1", "m3", "m2", "m4"],
    ];
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => setDraftOrder(db, leagueId, commissioner, orders[i % orders.length])),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const league = (await loadLeague(db, leagueId))!;
    expect(orders).toContainEqual(league.draft.seatOrder);
    expect(league.managers.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
    expect(league.version).toBe(1 + PARALLEL);
  });

  it("keeps both a reorder and a claim that race each other", async () => {
    const { leagueId, commissioner } = await newLeague();
    const invite = (await listActiveLinks(db, leagueId)).find((link) => link.kind === "league_invite")!;
    const guest = await createSession(db, crypto.randomUUID());
    const [reordered, claimed] = await Promise.all([
      setDraftOrder(db, leagueId, commissioner, ["m4", "m3", "m2", "m1"]),
      claimLink(db, invite.id, guest, { managerId: "m3", displayName: "Dee" }),
    ]);
    expect(reordered.ok && claimed.ok).toBe(true);
    const league = (await loadLeague(db, leagueId))!;
    expect(league.draft.seatOrder).toEqual(["m4", "m3", "m2", "m1"]);
    expect(league.managers[1]).toEqual({ id: "m3", seat: 1, displayName: "Dee" });
  });
```

Run (only if a Postgres is available): `TEST_DATABASE_URL=postgres://… npm run test:pg`
Expected: PASS. Without one, `npm test` skips the file; say so in the task report instead of claiming it passed.

- [ ] **Step 8: Add the route**

Create `src/app/api/leagues/[leagueId]/order/route.ts`:

```ts
import { setDraftOrder } from "@/db/actions";
import { parseDraftOrder } from "@/lib/league/draft-order";
import { getDb } from "@/server/db";
import { errorResponse, isSameOrigin, readJsonBody } from "@/server/http";
import { toLeagueView } from "@/server/league";
import { getSession } from "@/server/session";

/** Set the draft order before the draft: `{ order: ["m3", "m1", "m2", "m4"] }`, every manager id once, round 1 first. Commissioner only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/leagues/[leagueId]/order">) {
  if (!isSameOrigin(request)) return errorResponse("forbidden");
  const { leagueId } = await ctx.params;
  const order = parseDraftOrder(await readJsonBody(request));
  if (!order) return errorResponse("invalid_request");
  const session = await getSession();
  const result = await setDraftOrder(await getDb(), leagueId, session?.id ?? null, order);
  if (!result.ok) return errorResponse(result.error);
  return Response.json(await toLeagueView(result.value.league, result.value.actorId));
}
```

(`npm run typecheck` runs `next typegen` first, which creates the `RouteContext` entry for the new path.)

- [ ] **Step 9: Add smoke checks**

In `scripts/smoke.sh`, insert after the "only the commissioner overrides lines" check and **before**
`call ben POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'` (the order is put back, so the later picks still
start with Ana):

```bash
call ben PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "only the commissioner sets the draft order" 403 '"forbidden"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m1","m1","m3","m4"]}'
check "a draft order must name every manager once" 409 '"invalid_order"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":"m1"}'
check "a malformed draft order is refused" 400 '"invalid_request"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "commissioner reorders the draft" 200 '"seatOrder":["m2","m1","m3","m4"]'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m1","m2","m3","m4"]}'
check "commissioner puts the order back" 200 '"seatOrder":["m1","m2","m3","m4"]'
```

and after the "commissioner starts; lines freeze" check:

```bash
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "draft order is locked once the draft starts" 409 '"order_locked"'
```

Run: start the dev server (preview_start `{ name: "dev" }`, or `RECORD_SOURCE=static LINE_SOURCE=static npm run dev`
in the background), then `scripts/smoke.sh http://localhost:3000`
Expected: every line `PASS`, exit code 0.

- [ ] **Step 10: Full checks and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

```bash
git add src/db/leagues.ts src/db/actions.ts src/db/actions.test.ts src/db/concurrency.pg.test.ts \
  "src/app/api/leagues/[leagueId]/order/route.ts" scripts/smoke.sh
git commit -m "feat: PUT /api/leagues/{id}/order stores the draft order in managers.seat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Manager labels and avatar colors follow the id, not the position

**Files:**
- Modify: `src/lib/league/managers.ts`, `src/lib/league/managers.test.ts`
- Modify: `src/components/ui/ManagerAvatar.tsx`
- Modify: `src/components/access/LinkClaimForm.tsx:111,121`

**Interfaces:**
- Produces: `managerNumber(manager: Pick<Manager, "id" | "seat">): number`;
  `managerLabel(manager: Pick<Manager, "id" | "seat" | "displayName">): string`;
  `managerInitials(manager: Pick<Manager, "id" | "seat">): string`.

- [ ] **Step 1: Update the tests first**

In `src/lib/league/managers.test.ts`, add `managerNumber` to the import and replace the
`describe("managerLabel and managerInitials", …)` block with:

```ts
describe("managerNumber, managerLabel and managerInitials", () => {
  it("number a manager by their id, wherever they sit in the draft order", () => {
    expect(managerNumber({ id: "m3", seat: 0 })).toBe(3);
    expect(managerNumber({ id: "m12", seat: 4 })).toBe(12);
  });

  it("fall back to the seat for ids that aren't m{n}", () => {
    expect(managerNumber({ id: "guest", seat: 2 })).toBe(3);
  });

  it("use the display name when claimed, else the manager's number", () => {
    expect(managerLabel({ id: "m1", seat: 1, displayName: "Ana" })).toBe("Ana");
    expect(managerLabel({ id: "m3", seat: 0, displayName: null })).toBe("Manager 3");
    expect(managerInitials({ id: "m4", seat: 0 })).toBe("M4");
  });

  it("match the old seat-based names for a league that was never reordered", () => {
    for (const manager of MANAGERS) {
      expect(managerInitials(manager)).toBe(`M${manager.seat + 1}`);
    }
  });
});
```

Run: `npx vitest run src/lib/league/managers.test.ts`
Expected: FAIL — `managerNumber` is not exported.

- [ ] **Step 2: Implement**

In `src/lib/league/managers.ts` replace `managerLabel` and `managerInitials` with:

```ts
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
```

In `src/components/ui/ManagerAvatar.tsx`, import `managerNumber` alongside `managerInitials` and change the color
class to `${SEAT_BG[(managerNumber(manager) - 1) % SEAT_BG.length]}`.

In `src/components/access/LinkClaimForm.tsx`:
- line 111: `{isOpen ? \`${managerLabel(manager)} · open · draft position ${manager.seat + 1}\` : managerLabel(manager)}`
- line 121: `Rejoin as {managerLabel(seat)}. The seat's picks are kept; you can change the name.`

- [ ] **Step 3: Run tests, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass. If typecheck flags a caller passing an object without `id`, pass the `Manager` itself.

- [ ] **Step 4: Commit**

```bash
git add src/lib/league/managers.ts src/lib/league/managers.test.ts src/components/ui/ManagerAvatar.tsx \
  src/components/access/LinkClaimForm.tsx
git commit -m "feat: manager labels and avatar colors follow the manager, not the draft position

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Draft order panel in the lobby

**Files:**
- Create: `src/components/draft/DraftOrderPanel.tsx`
- Modify: `src/components/draft/DraftLobby.tsx`, `src/components/draft/DraftRoomView.tsx`,
  `src/components/draft/use-league-draft.ts`, `src/components/tutorial/use-tutorial-session.ts`

**Interfaces:**
- Consumes: `moveInOrder`, `shuffled` (Task 1); `managerLabel`, `findManager` (Task 5); `PUT …/order` (Task 4).
- Produces: `DraftRoomDriver.saveDraftOrder: (order: string[]) => Promise<boolean>`;
  `DraftOrderPanel` props `{ league, viewerId, canEdit, pending, onSave, onDirtyChange }`.

- [ ] **Step 1: Driver**

In `src/components/draft/DraftRoomView.tsx` add to `DraftRoomDriver` (after `saveConfig`):

```ts
  saveDraftOrder: (order: string[]) => Promise<boolean>;
```

In `src/components/draft/use-league-draft.ts`, after `saveConfig`:

```ts
  const saveDraftOrder = useCallback(
    (order: string[]) => send(`/api/leagues/${initial.league.id}/order`, "PUT", { order }),
    [send, initial.league.id],
  );
```

and return `{ view, error, pending, dispatch, saveLineOverrides, saveConfig, saveDraftOrder, dismissError }`.

In `src/components/tutorial/use-tutorial-session.ts`, next to `saveConfig: async () => false,` add
`saveDraftOrder: async () => false,` and change the comment above to "(lines, league size, draft order)".

- [ ] **Step 2: Create `DraftOrderPanel`**

Create `src/components/draft/DraftOrderPanel.tsx`:

```tsx
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
```

Note: the panel shows `order` (its local copy) mapped through `findManager`, so a claim seen by polling updates the
row's name while an unsaved order stays. If the seat set changes (league size saved), the parent's `key` changes and
the panel remounts on the server's order.

- [ ] **Step 3: Use it in the lobby**

In `src/components/draft/DraftLobby.tsx`:
- Add props `onSaveOrder: (order: string[]) => Promise<boolean>;` and `onOrderDirtyChange: (dirty: boolean) => void;`
  (destructure them too).
- Import `DraftOrderPanel` from `./DraftOrderPanel`; drop the `ManagerAvatar` and `managerLabel` imports if now unused
  (`openSeats` is still used).
- Replace the whole `<ul className="grid gap-3 …">…</ul>` block with:

```tsx
      <DraftOrderPanel
        key={league.draft.seatOrder.join(",")}
        league={league}
        viewerId={viewerId}
        canEdit={canControl}
        pending={pending}
        onSave={onSaveOrder}
        onDirtyChange={onOrderDirtyChange}
      />
```

- [ ] **Step 4: Block Start while the order is unsaved**

In `src/components/draft/DraftRoomView.tsx`:
- Destructure `saveDraftOrder` from `driver`.
- Add `const [orderDirty, setOrderDirty] = useState(false);` next to `configDirty`.
- In `startBlocker`, right after the `configDirty` branch, add:

```ts
      : orderDirty
        ? "Save or discard your draft order change first."
```

- Pass to `<DraftLobby …>`: `onSaveOrder={saveDraftOrder}` and `onOrderDirtyChange={setOrderDirty}`.

Run: `npm test && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Verify in the browser**

Start the dev server: preview_start `{ name: "dev" }` (if it reads the main checkout's `.claude/launch.json` instead of
this worktree's, add a temporary config there — see memory "preview_start launch.json location"). A dev server started
before Task 4 must be restarted. Then:

1. Create a league from `/` (name "Order Test"), open its draft room. Expect the "Draft order" list numbered 1–4,
   grip handles, ↑/↓ buttons, "Randomize order", disabled "Save order", "Saved. Everyone in the league sees this order."
2. Click ↓ on row 1: Ana moves to 2, "Unsaved changes" badge, Start shows "Save or discard your draft order change first."
3. Click "Randomize order" a few times: the list changes each time (the same order can repeat), still 4 distinct rows.
4. Drag a row onto another (desktop) — `left_click_drag` from one grip to another row — and check the order follows.
5. Save. Reload the page: the saved order is shown and the badge is gone. `read_network_requests` shows
   `PUT …/order` 200.
6. In another tab (no session; e.g. `GET /api/leagues/{id}/draft` with `get_page_text`) the `seatOrder` matches and the
   page shows no ↑/↓ buttons ("Set by the commissioner…").
7. Review Focus 5: make an unsaved change, then claim an open seat from a second browser context (or with
   `curl` against the invite) and wait for a poll: the claimed name appears in its row, the unsaved order stays.
8. Set lines/tick the box and start the draft: the draft board's columns run in the saved order and the first pick is
   the manager at position 1.
9. `resize_window` 375×812 and 1440×900: no horizontal page scroll
   (`document.documentElement.scrollWidth <= innerWidth` via `javascript_tool`); rows don't overflow with a 24-char name.
   Reset with preset "desktop".
10. `read_console_messages` with `onlyErrors`: none. Take a screenshot of the editor for the report.

Delete the test league's rows only if you used a scratch database; with the default PGlite at `.data/pglite` leave it.

- [ ] **Step 6: Commit**

```bash
git add src/components/draft/DraftOrderPanel.tsx src/components/draft/DraftLobby.tsx \
  src/components/draft/DraftRoomView.tsx src/components/draft/use-league-draft.ts \
  src/components/tutorial/use-tutorial-session.ts
git commit -m "feat: draft order panel in the lobby: drag, arrows, randomize, save

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Architecture → `src/lib/`: after "league size rules (`league/config.ts`)," add "draft order (`league/draft-order.ts`),".
- Domain rules → after the "Draft: snake order; …" bullet, add:

```markdown
- Draft order: `managers.seat` is the order (round 1 in seat order, the snake reverses after). Before the start the
  commissioner reorders or randomizes it in the draft lobby and saves (`PUT /api/leagues/{id}/order`,
  `decideDraftOrder`): every manager id exactly once (`invalid_order`), refused once the draft starts
  (`order_locked`). Reordering renumbers seats only; ids, names, links and sessions stay. Randomize is a client-side
  Fisher–Yates over `crypto.getRandomValues` into the unsaved order. Seats are removed from the end of the order; a
  new seat takes the smallest unused id `m{n}`. Labels, initials and avatar colors follow the id (`managerNumber`),
  never the position.
```

- Domain rules: change "Commissioner = seat 1." to "Commissioner = `m1` (`commissionerId`), wherever they sit in the
  draft order."

- [ ] **Step 2: Final verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass. Report whether `npm run test:pg` was run (it needs `TEST_DATABASE_URL`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: draft order rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Test matrix (requirement → where it is pinned)

| Requirement | Tests |
| --- | --- |
| Manual reorder persists after reload | Task 4 "persists after a reload"; Task 6 browser step 5 |
| Randomize = valid permutation, unbiased | Task 1 `shuffled` (2–12 sizes, Fisher–Yates bounds, uniformity), `secureRandomIndex` (range, rejection) |
| Correct snake after reorder | Task 3 "starts the draft from the saved order and snakes"; Task 4 "starts the draft from the saved order" |
| Unauthorized attempts | Task 3 "belongs to the commissioner"; Task 4 "refuses other managers, spectators…"; smoke 403 |
| Reorder after the draft begins | Task 3 lifecycle tests (live, paused, fades, complete, picks present); Task 4; smoke 409 |
| Concurrent update / start | Task 4 `concurrency.pg.test.ts` (reorder vs start, parallel reorders, reorder vs claim) |
| Identities, links, sessions unchanged | Task 4 "keeps names, sessions and links"; Task 5 label tests |
| Existing league compatibility | No migration; Task 4 "never reordered"; Task 5 "match the old seat-based names"; existing league-size tests unchanged |
| 2–12 managers | Task 1 sizes 2–12; Task 2 sizes 2–12; Task 3 "works at 2 and 12 managers" |
