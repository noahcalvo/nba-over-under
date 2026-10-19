"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { isActive, navItems, type NavItem } from "./nav-items";

function itemClass(active: boolean): string {
  return `flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-base transition-colors ${
    active
      ? "border-accent bg-accent/10 font-semibold text-accent"
      : "border-transparent text-fog-300 hover:bg-ink-800 hover:text-fog-50"
  }`;
}

function ItemContent({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <>
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {!item.ready && <Badge tone="soon">Soon</Badge>}
      {item.clock && <Clock aria-hidden className="size-4 shrink-0" />}
    </>
  );
}

function NavList({ items, render }: { items: NavItem[]; render: (item: NavItem) => ReactNode }) {
  return (
    <nav aria-label="League" className="flex flex-col gap-1">
      {items.filter((item) => item.group === "league").map((item) => render(item))}
      <hr className="my-3 border-ink-700" />
      {items.filter((item) => item.group === "more").map((item) => render(item))}
    </nav>
  );
}

export function SidebarNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  return (
    <NavList
      items={navItems(leagueId)}
      render={(item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.tour}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <ItemContent item={item} />
          </Link>
        );
      }}
    />
  );
}

/** The same items before the league is known (the prerendered shell): they look the same but don't link yet. */
export function SidebarNavSkeleton() {
  return (
    <NavList
      items={navItems("")}
      render={(item) => (
        <span key={item.label} aria-disabled="true" className={itemClass(false)}>
          <ItemContent item={item} />
        </span>
      )}
    />
  );
}
