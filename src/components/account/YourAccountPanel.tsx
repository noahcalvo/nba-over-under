import { Panel } from "@/components/ui/Panel";

/** Who is signed in, and that seats belong to the account. */
export function YourAccountPanel({ email }: { email: string }) {
  return (
    <Panel title="Your account" bodyClassName="p-4 text-fog-300 sm:p-5">
      <p>
        Signed in as <span className="font-semibold text-fog-50">{email}</span>. Your seat follows your Google account.
      </p>
    </Panel>
  );
}
