"use client";

/** On/off switch. The label text names the control and toggles it on click. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-base font-medium text-fog-50">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          checked ? "border-accent bg-accent" : "border-ink-600 bg-ink-800"
        }`}
      >
        <span
          aria-hidden
          className={`size-5 rounded-full bg-fog-50 shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
      {label}
    </label>
  );
}
