import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

/** Old public join links land here. Joining now needs the league's private invite link. */
export default function JoinPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Join league" subtitle="Invites are private" />
      <Panel bodyClassName="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="text-fog-300">
          Ask your commissioner for the league&apos;s invite link. It opens a page where you pick an open seat.
        </p>
        <Link href="/" className={buttonClasses("secondary")}>
          All leagues
        </Link>
      </Panel>
    </div>
  );
}
