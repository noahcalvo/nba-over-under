import { ShowProjectedProvider } from "@/components/team/ShowProjected";

// Stays mounted across team pages, so the "Show projected" switch keeps its value when switching teams.
export default function TeamsLayout({ children }: LayoutProps<"/l/[leagueId]/teams">) {
  return <ShowProjectedProvider>{children}</ShowProjectedProvider>;
}
