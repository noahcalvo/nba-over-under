import Link from "next/link";
import { Suspense } from "react";
import { getLegacyItems } from "@/server/legacy";

async function Notice() {
  if (!(await getLegacyItems())) return null;
  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-ink-600 bg-ink-850 px-4 py-3 text-sm text-fog-50"
    >
      <p>This browser has seats or a 30/30 entry from before sign-in.</p>
      <Link href="/account" className="font-semibold text-link hover:text-fog-50">
        Move them to your account
      </Link>
    </div>
  );
}

/**
 * Tells a signed-in viewer that this browser still holds seats or an entry from before sign-in. It reads the session
 * and the database, so it streams in on its own and renders nothing for everyone else.
 */
export function LegacyNotice() {
  return (
    <Suspense fallback={null}>
      <Notice />
    </Suspense>
  );
}
