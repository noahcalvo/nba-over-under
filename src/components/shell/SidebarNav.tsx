"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { isActive, navItems } from "./nav-items";

export function SidebarNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const items = navItems(leagueId);
  const draft = items[items.length - 1];
  const league = items.slice(0, -1);

  const link = (item: (typeof items)[number], trailing?: React.ReactNode) => {
    const active = isActive(item, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-base transition-colors ${
          active
            ? "border-accent bg-accent/10 font-semibold text-accent"
            : "border-transparent text-fog-300 hover:bg-ink-800 hover:text-fog-50"
        }`}
      >
        <Icon aria-hidden className="size-5 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {!item.ready && <Badge tone="soon">Soon</Badge>}
        {trailing}
      </Link>
    );
  };

  return (
    <nav aria-label="League" className="flex flex-col gap-1">
      {league.map((item) => link(item))}
      <hr className="my-3 border-ink-700" />
      {link(draft, <Clock aria-hidden className="size-4 shrink-0" />)}
    </nav>
  );
}
