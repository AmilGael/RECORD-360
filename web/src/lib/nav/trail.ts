// The in-app navigation trail behind "Volver". Pure functions only: the
// sessionStorage wiring lives in trail-storage.ts and components/nav-trail.tsx.
//
// The trail is a stack of normalized /app URLs, newest last. It exists because
// router.back() can leave the app (a partida opened from an email or WhatsApp
// link has no in-app history), and because fixed "back" links drop context
// (the bloque, the selected partida, the active tab).

export type Trail = string[];

/** Entries kept; older ones fall off the bottom. */
export const TRAIL_CAP = 50;

// One-shot UI states: returning to a screen must not reopen a correction or a
// reply that was already sent or cancelled.
const TRANSIENT_PARAMS = ["correctionOf", "replyTo"];

export function isTrailPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/** Path + search, without transient params. Every other param (tab, block, p, space, filters, page) is kept. */
export function normalizeEntry(url: string): string {
  const u = new URL(url, "http://trail.invalid");
  for (const key of TRANSIENT_PARAMS) u.searchParams.delete(key);
  const search = u.searchParams.toString();
  return search ? `${u.pathname}?${search}` : u.pathname;
}

function pathOf(entry: string): string {
  return new URL(entry, "http://trail.invalid").pathname;
}

/** Records a forward navigation. Ignores non-/app URLs and repeats of the current top. */
export function pushEntry(trail: Trail, url: string): Trail {
  const entry = normalizeEntry(url);
  if (!isTrailPath(pathOf(entry))) return trail;
  if (trail[trail.length - 1] === entry) return trail;
  return [...trail, entry].slice(-TRAIL_CAP);
}

/** Cuts the trail back to the last occurrence of `entry`; unchanged when it is not there. */
export function popTo(trail: Trail, entry: string): Trail {
  const i = trail.lastIndexOf(normalizeEntry(entry));
  return i === -1 ? trail : trail.slice(0, i + 1);
}

/**
 * Browser back/forward landed on `current`. Back to the previous entry pops it;
 * a popstate that stays on the same screen (only transient params changed)
 * keeps the trail; anything else (forward, or a jump the trail cannot place)
 * starts over from `current`.
 */
export function reconcileOnPop(trail: Trail, current: string): Trail {
  const entry = normalizeEntry(current);
  if (trail.length >= 2 && trail[trail.length - 2] === entry) return trail.slice(0, -1);
  if (trail[trail.length - 1] === entry) return trail;
  return isTrailPath(pathOf(entry)) ? [entry] : [];
}

/** Where "Volver" goes: the entry below the current screen, if any. */
export function previousEntry(trail: Trail): string | null {
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}

export type TrailChange =
  | { kind: "push" }
  | { kind: "pop" }
  /** Volver already popped the trail down to `target` before navigating. */
  | { kind: "back"; target: string };

/** The trail after a route change to `current`. */
export function nextTrail(trail: Trail, current: string, change: TrailChange): Trail {
  if (change.kind === "pop") return reconcileOnPop(trail, current);
  // A Volver whose target redirected elsewhere is recorded like any other move.
  if (change.kind === "back" && normalizeEntry(current) === normalizeEntry(change.target)) return trail;
  // A remount after browser back (full goto, or a missed popstate) looks like
  // a push of the previous screen. Treating it as a pop stops Volver bouncing
  // forward again.
  const entry = normalizeEntry(current);
  if (change.kind === "push" && trail.length >= 2 && trail[trail.length - 2] === entry) {
    return trail.slice(0, -1);
  }
  return pushEntry(trail, current);
}

/** Parses a stored trail; anything malformed reads as empty. */
export function parseTrail(raw: string | null): Trail {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return [];
    return value.slice(-TRAIL_CAP);
  } catch {
    return [];
  }
}
