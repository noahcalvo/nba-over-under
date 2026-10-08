/** "2025–26" (en dash or hyphen) → 2026, the season's end year. Null for anything else. */
export function seasonEndYear(label: string): number | null {
  const match = /^(\d{4})[–-](\d{2})$/.exec(label.trim());
  if (!match) return null;
  const end = Number(match[1]) + 1;
  return end % 100 === Number(match[2]) ? end : null;
}

/** 2027 → "2026–27". */
export function seasonLabelFor(endYear: number): string {
  return `${endYear - 1}–${String(endYear % 100).padStart(2, "0")}`;
}
