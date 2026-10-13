import { CircleHelp, FileText, House, Trophy, Zap, type LucideIcon } from "lucide-react";

export interface ChallengeNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Match the path exactly (the challenge root must not light up on its sub-pages). */
  exact: boolean;
  /** Other path prefixes that also light this item up (pages that belong to it). */
  alsoActive?: string[];
  /** Shown in the sidebar only, not in the bottom tab bar. */
  sidebarOnly?: boolean;
}

export function challengeNavItems(): ChallengeNavItem[] {
  return [
    { href: "/", label: "Home", shortLabel: "Home", icon: House, exact: true, sidebarOnly: true },
    { href: "/challenge", label: "30/30 Challenge", shortLabel: "Picks", icon: Zap, exact: true },
    {
      href: "/challenge/my-picks",
      label: "My Picks",
      shortLabel: "My Picks",
      icon: FileText,
      exact: false,
      alsoActive: ["/challenge/teams"],
    },
    {
      href: "/challenge/leaderboard",
      label: "Leaderboard",
      shortLabel: "Board",
      icon: Trophy,
      exact: false,
      alsoActive: ["/challenge/entries"],
    },
    { href: "/challenge/how-it-works", label: "How It Works", shortLabel: "How It Works", icon: CircleHelp, exact: false },
  ];
}

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isChallengeNavActive(item: ChallengeNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return underPrefix(pathname, item.href) || (item.alsoActive ?? []).some((prefix) => underPrefix(pathname, prefix));
}
