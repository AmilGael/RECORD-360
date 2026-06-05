export type Health = "red" | "yellow" | "green";

/** Traffic-light health from a 0-100 progress percentage (v1: progress-based). */
export function healthLevel(progressPct: number): Health {
  if (progressPct >= 67) return "green";
  if (progressPct >= 34) return "yellow";
  return "red";
}
