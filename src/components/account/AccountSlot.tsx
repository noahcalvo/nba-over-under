import { Suspense } from "react";
import { getAccount } from "@/server/account";
import { AccountMenu, type AccountPlacement } from "./AccountMenu";

/** Same footprint as the loaded control, so the header and sidebar don't shift when the account arrives. */
function AccountFallback({ placement }: { placement: AccountPlacement }) {
  if (placement === "tab") {
    return (
      <div aria-hidden className="flex h-16 flex-col items-center justify-center gap-0.5 text-xs text-fog-300">
        <span className="size-5 animate-pulse rounded-full bg-ink-700" />
        <span>Account</span>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`rounded-lg border border-ink-700 bg-ink-850 ${placement === "sidebar" ? "h-[3.125rem] w-full" : "h-10 w-[4.5rem] shrink-0"}`}
    />
  );
}

async function Account({ placement }: { placement: AccountPlacement }) {
  return <AccountMenu account={await getAccount()} placement={placement} />;
}

/**
 * The shells' account control. It reads the session, so it streams in on its own: the shell around it stays
 * prerendered and never waits for it.
 */
export function AccountSlot({ placement }: { placement: AccountPlacement }) {
  return (
    <Suspense fallback={<AccountFallback placement={placement} />}>
      <Account placement={placement} />
    </Suspense>
  );
}
