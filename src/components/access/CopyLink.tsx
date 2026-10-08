"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

const noopSubscribe = () => () => {};

/** A private link with a copy button. `path` is app-relative ("/i/…"); the browser adds its own origin. */
export function CopyLink({
  path,
  label,
  description,
  compact = false,
}: {
  path: string;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  // window.location is client-only; the server render shows the path alone.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const url = `${origin}${path}`;

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
        {copied ? "Link copied" : `Copy ${label.toLowerCase()}`}
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id={inputId}
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
      {description && <p className="text-sm text-fog-400">{description}</p>}
    </div>
  );
}
