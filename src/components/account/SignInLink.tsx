import type { ReactNode } from "react";
import { startSignInHref } from "@/lib/access/next-path";

/**
 * A link that goes straight to Google sign-in and returns to `next`. A plain `<a>`, never `next/link`: a prefetch of
 * /sign-in/start would start a sign-in (a state cookie and a verification row) without a click.
 */
export function SignInLink({ next, className, children }: { next: string; className?: string; children: ReactNode }) {
  return (
    <a href={startSignInHref(next)} className={className}>
      {children}
    </a>
  );
}
