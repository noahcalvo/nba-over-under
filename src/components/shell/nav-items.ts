import { CalendarDays, ClipboardList, House, Settings, UserRound, Zap, type LucideIcon } from "lucide-react";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import type { TourTargetId } from "@/lib/tour/targets";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** False for unfinished pages; they show "Soon". */
  ready: boolean;
  /** Match the path exactly (the overview is the league root). */
  exact: boolean;
  /** Names the link for a guided tour (data-tour). */
  tour?: TourTargetId;
  /** League pages come first; "more" sits below the divider in the sidebar. */
  group: "league" | "more";
  /** Shows the clock icon (the draft room). */
  clock?: true;
}

export function navItems(leagueId: string): NavItem[] {
  const base = `/l/${leagueId}`;
  const items: NavItem[] = [
    {
      href: base,
      label: "League overview",
      shortLabel: "Overview",
      icon: House,
      ready: true,
      exact: true,
      tour: "nav-overview",
      group: "league",
    },
    {
      href: `${base}/rosters`,
      label: "Rosters",
      shortLabel: "Rosters",
      icon: UserRound,
      ready: true,
      exact: false,
      group: "league",
    },
    {
      href: `${base}/settings`,
      label: "League settings",
      shortLabel: "Settings",
      icon: Settings,
      ready: true,
      exact: false,
      group: "league",
    },
    {
      href: `${base}/draft`,
      label: "Draft room",
      shortLabel: "Draft",
      icon: ClipboardList,
      ready: true,
      exact: false,
      group: "more",
      clock: true,
    },
  ];
  // /nba and /challenge sit outside /l/{id}, so the league shell never marks them active. The demo league keeps to
  // its own pages.
  if (leagueId !== DEMO_LEAGUE_ID) {
    items.push(
      {
        href: "/nba",
        label: "NBA schedule",
        shortLabel: "NBA",
        icon: CalendarDays,
        ready: true,
        exact: false,
        group: "more",
      },
      {
        href: "/challenge",
        label: "30/30 Challenge",
        shortLabel: "30/30",
        icon: Zap,
        ready: true,
        exact: false,
        group: "more",
      },
    );
  }
  return items;
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
