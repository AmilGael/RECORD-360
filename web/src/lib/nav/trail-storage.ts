import { parseTrail, type Trail } from "./trail";

// Per-tab storage: a new tab or a deep link from outside starts with an empty
// trail, so "Volver" falls back to the screen's logical parent.
const TRAIL_KEY = "raphel:nav-trail";
const BACK_KEY = "raphel:nav-trail:back";

// Every access is guarded: Safari private mode and locked-down browsers throw
// on sessionStorage. Without storage, "Volver" uses its fallback.

export function readTrail(): Trail {
  try {
    return parseTrail(window.sessionStorage.getItem(TRAIL_KEY));
  } catch {
    return [];
  }
}

export function writeTrail(trail: Trail): boolean {
  try {
    window.sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail));
    return true;
  } catch {
    return false;
  }
}

/** Marks the next route change as Volver's own navigation to `target`. */
export function writeBackMarker(target: string): boolean {
  try {
    window.sessionStorage.setItem(BACK_KEY, target);
    return true;
  } catch {
    return false;
  }
}

/** Reads and clears the marker (one-shot). */
export function takeBackMarker(): string | null {
  try {
    const target = window.sessionStorage.getItem(BACK_KEY);
    window.sessionStorage.removeItem(BACK_KEY);
    return target;
  } catch {
    return null;
  }
}
