const MINUS = "−";

export const NOT_AVAILABLE = "Not available";

// Rounds half away from zero so Over and Under margins of equal size display symmetrically.
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumber(value: number, digits = 1): string {
  const rounded = roundTo(value, digits);
  const text = Math.abs(rounded).toFixed(digits);
  return rounded < 0 ? `${MINUS}${text}` : text;
}

/** "+1.8", "−3.4", or "0.0" when the value rounds to zero. */
export function formatSigned(value: number, digits = 1): string {
  const rounded = roundTo(value, digits);
  const text = Math.abs(rounded).toFixed(digits);
  if (rounded === 0) return text;
  return rounded > 0 ? `+${text}` : `${MINUS}${text}`;
}

export function formatOrdinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}
