import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";

/** A challenge page title. Extra controls (children) sit right-aligned from sm, like the league pages' actions. */
export function ChallengePageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children?: ReactNode;
}) {
  return <PageHeader title={title} subtitle={subtitle} actions={children} />;
}
