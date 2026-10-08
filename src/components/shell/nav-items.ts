import { ClipboardList, House, Settings, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** False for unfinished pages; they show "Soon". */
  ready: boolean;
  /** Match the path exactly (the overview is the league root). */
  exact: boolean;
}

export function navItems(leagueId: string): NavItem[] {
  const base = `/l/${leagueId}`;
  return [
    { href: base, label: "League overview", shortLabel: "Overview", icon: House, ready: true, exact: true },
    { href: `${base}/rosters`, label: "Rosters", shortLabel: "Rosters", icon: UserRound, ready: false, exact: false },
    { href: `${base}/settings`, label: "League settings", shortLabel: "Settings", icon: Settings, ready: false, exact: false },
    { href: `${base}/draft`, label: "Draft room", shortLabel: "Draft", icon: ClipboardList, ready: true, exact: false },
  ];
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
