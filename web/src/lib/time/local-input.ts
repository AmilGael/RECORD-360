// Browser-side helpers for <input type="datetime-local">. Its value is a wall
// time on the DEVICE clock with no offset; only the browser knows that zone,
// so the conversion to an instant happens here, before anything leaves the
// page. The server reads offset-less values in APP_TIME_ZONE instead.
import { useEffect, useState } from "react";

/** datetime-local value → ISO instant with Z, or "" when empty/invalid. */
export function datetimeLocalToIso(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** An instant as a datetime-local value ("YYYY-MM-DDTHH:mm") on the device clock. */
export function datetimeLocalValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * `min` for a future-only datetime-local input: one minute from now on the
 * device clock. Undefined until mounted — the server renders in UTC and has no
 * idea of the device's zone, so computing it during render would differ
 * between server and client markup.
 */
export function useDatetimeLocalMin(): string | undefined {
  const [min, setMin] = useState<string | undefined>(undefined);
  useEffect(() => {
    setMin(datetimeLocalValue(new Date(Date.now() + 60_000)));
  }, []);
  return min;
}
