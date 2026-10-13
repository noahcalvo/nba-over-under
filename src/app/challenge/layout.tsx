import { ChallengeShell } from "@/components/challenge/ChallengeShell";

export default function ChallengeLayout({ children }: { children: React.ReactNode }) {
  return <ChallengeShell>{children}</ChallengeShell>;
}
