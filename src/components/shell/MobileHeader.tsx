import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * Every shell's top bar below lg: the general way around (a league menu, then the pages outside the leagues). The
 * section's own pages and the account sit in its bottom tab bar.
 */
export function MobileHeader({ leagues, nav }: { leagues: ReactNode; nav: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <Logo compact />
      <div className="min-w-0 flex-1 sm:max-w-56">{leagues}</div>
      <div className="ml-auto">{nav}</div>
    </header>
  );
}
