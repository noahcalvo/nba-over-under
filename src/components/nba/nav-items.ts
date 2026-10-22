import { CalendarDays, House, Zap, type LucideIcon } from "lucide-react";

export interface NbaNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Match the path exactly (Home must not light up on every page). */
  exact: boolean;
  /** Shown in the sidebar only: below lg the challenge is in the top bar (GlobalNav). */
  sidebarOnly?: boolean;
}

export function nbaNavItems(): NbaNavItem[] {
  return [
    { href: "/", label: "Home", shortLabel: "Home", icon: House, exact: true },
    { href: "/nba", label: "NBA schedule", shortLabel: "Schedule", icon: CalendarDays, exact: false },
    { href: "/challenge", label: "30/30 Challenge", shortLabel: "Challenge", icon: Zap, exact: false, sidebarOnly: true },
  ];
}

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNbaNavActive(item: NbaNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return underPrefix(pathname, item.href);
}
