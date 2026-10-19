import { NbaShell } from "@/components/nba/NbaShell";

export default function NbaLayout({ children }: { children: React.ReactNode }) {
  return <NbaShell>{children}</NbaShell>;
}
