export const ACCESS = {
  /** A session expires this many days after it was last used. */
  sessionIdleDays: 90,
  /** A session's expiry is pushed back at most this often. */
  sessionRenewHours: 24,
  /** Cookie lifetime. Browsers cap it near 400 days; the server enforces the real expiry. */
  cookieMaxAgeDays: 400,
  /** A seat invite (issued by a seat reset) works for this many days. */
  seatInviteDays: 7,
} as const;
