"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/components/access/send-json";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { formatUpdatedAt } from "@/lib/format";
import type { RecordStatus } from "@/lib/records/types";

/** "Records updated …" for everyone; the commissioner can refresh. */
export function RecordsStatus({
  leagueId,
  status,
  canRefresh,
}: {
  leagueId: string;
  status: RecordStatus;
  canRefresh: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function refresh() {
    setPending(true);
    setFailure(null);
    const result = await sendJson(`/api/leagues/${leagueId}/records/refresh`, "POST");
    setPending(false);
    if (!result.ok) setFailure(result.message);
    router.refresh();
  }

  const reason = failure ?? (canRefresh ? status.error : null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fog-400">
        <p>
          {status.asOf ? (
            <>
              Records updated{" "}
              <time dateTime={status.asOf} suppressHydrationWarning className="text-fog-50">
                {formatUpdatedAt(status.asOf)}
              </time>{" "}
              · {status.source}
            </>
          ) : (
            "Records not updated yet"
          )}
        </p>
        {canRefresh && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={refresh}>
            <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Refreshing…" : "Refresh records"}
          </Button>
        )}
      </div>
      {reason && (
        <Alert onDismiss={failure ? () => setFailure(null) : undefined}>
          Couldn&apos;t refresh records: {reason}{" "}
          {status.asOf ? `Showing records from ${formatUpdatedAt(status.asOf)}.` : "No records are loaded yet."}
        </Alert>
      )}
    </div>
  );
}
