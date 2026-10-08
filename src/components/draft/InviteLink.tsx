"use client";

import { Check, Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

const noopSubscribe = () => () => {};

export function InviteLink({ leagueId, compact = false }: { leagueId: string; compact?: boolean }) {
  // window.location is client-only; the server render uses a relative link.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/l/${leagueId}/join`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const icon = copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />;

  if (compact) {
    return (
      <Button variant="secondary" size="sm" onClick={copy}>
        {icon}
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`invite-${leagueId}`} className="text-sm font-semibold">
        Invite link
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id={`invite-${leagueId}`}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-fog-300"
        />
        <Button variant="secondary" onClick={copy}>
          {icon}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
