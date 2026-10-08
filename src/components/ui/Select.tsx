"use client";

import { ChevronDown } from "lucide-react";

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  /** Accessible label (visually hidden). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <label className={`relative inline-flex min-w-0 items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 w-full min-w-0 appearance-none rounded-lg border border-ink-600 bg-ink-900 pl-3 pr-9 text-sm text-fog-50 focus:border-accent focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-fog-400" />
    </label>
  );
}
