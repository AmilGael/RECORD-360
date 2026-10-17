const DAY = 24 * 60 * 60_000;

/** 7-day brass / 14-day rust-band marks. Null when there is no activity or it is still recent. */
export function activityAging(iso: string | null | undefined, now = Date.now()): "7" | "14" | null {
  if (!iso) return null;
  const age = now - new Date(iso).getTime();
  if (age >= 14 * DAY) return "14";
  if (age >= 7 * DAY) return "7";
  return null;
}
