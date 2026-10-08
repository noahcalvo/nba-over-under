"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-negative/50 bg-negative/10 px-4 py-3 text-sm text-fog-50"
    >
      <p>{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-fog-300 hover:text-fog-50">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
