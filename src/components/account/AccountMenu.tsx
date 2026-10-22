"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { signInHref } from "@/lib/access/next-path";
import type { Account } from "@/server/account";
import { authClient } from "./auth-client";

export type AccountPlacement = "sidebar" | "header";

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function AccountAvatar({ account }: { account: Account }) {
  const [broken, setBroken] = useState(false);
  if (account.image && !broken) {
    return (
      // Google serves the avatar from its own host and the default image loader would need it allow-listed; it is
      // already small, so it loads as-is.
      <Image
        src={account.image}
        alt=""
        width={32}
        height={32}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="size-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-seat-1 font-display text-sm font-bold text-white"
    >
      {initialsOf(account.name)}
    </span>
  );
}

/**
 * The account control in the shells: a "Sign in" link when signed out, otherwise the avatar and name with a menu to
 * sign out. Signed in, it asks the session route once on mount: server renders read the session without refreshing
 * it, so this route-handler call is what renews the session and its cookie.
 */
export function AccountMenu({ account, placement }: { account: Account | null; placement: AccountPlacement }) {
  if (!account) return <SignInLink placement={placement} />;
  return <SignedInMenu account={account} placement={placement} />;
}

function SignInLink({ placement }: { placement: AccountPlacement }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = signInHref(search ? `${pathname}?${search}` : pathname);
  return (
    <Link
      href={href}
      className={`${buttonClasses("secondary", "md")} ${placement === "sidebar" ? "w-full" : "shrink-0"}`}
    >
      Sign in
    </Link>
  );
}

function SignedInMenu({ account, placement }: { account: Account; placement: AccountPlacement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void authClient.getSession().catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setOpen(false);
      setSigningOut(false);
      router.refresh();
    }
  }

  const sidebar = placement === "sidebar";
  return (
    <div ref={root} className={`relative min-w-0 ${sidebar ? "w-full" : "shrink-0"}`}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={sidebar ? undefined : `Account menu, ${account.name}`}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-w-0 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 text-left ${
          sidebar ? "w-full px-3 py-2" : "h-10 px-1.5 sm:px-2"
        }`}
      >
        <AccountAvatar account={account} />
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${sidebar ? "" : "hidden sm:block sm:max-w-32"}`}>
          {account.name}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fog-300" />
      </button>
      {open && (
        <div
          className={`absolute z-40 rounded-lg border border-ink-600 bg-ink-900 p-2 shadow-xl ${
            sidebar ? "inset-x-0 bottom-full mb-2" : "right-0 mt-2 w-64"
          }`}
        >
          <p className="truncate border-b border-ink-700 px-3 pb-2 pt-1 text-sm text-fog-300">{account.email}</p>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-2 block w-full rounded-md px-3 py-2 text-left text-sm font-semibold hover:bg-ink-800 disabled:opacity-40"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
