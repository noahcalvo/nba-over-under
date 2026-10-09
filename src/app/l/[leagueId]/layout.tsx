import { AppShell } from "@/components/shell/AppShell";
import { leagueChrome } from "@/server/league";

// Not awaited: the frame is part of the prerendered HTML and every page renders at once with its own loading state;
// the league switcher and nav links stream in when the league is read. Pages call getLeagueOrNotFound themselves, so
// an unknown league still shows the not-found page.
export default function LeagueLayout({ params, children }: LayoutProps<"/l/[leagueId]">) {
  const chrome = params.then(({ leagueId }) => leagueChrome(leagueId));
  return <AppShell chrome={chrome}>{children}</AppShell>;
}
