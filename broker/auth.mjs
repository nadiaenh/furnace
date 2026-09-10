import { timingSafeEqual } from "node:crypto";

// Constant-time comparison of the caller's x-api-key against the configured key.
export function authorized(provided, expected) {
  if (typeof provided !== "string" || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
