"use client";

// Ids marked read in this tab. A back/swipe restore of the cached
// notifications payload still has those rows as unread; the board reapplies
// this set so they stay under Leídas until server data shows them read.

const ids = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const fn of listeners) fn();
}

export function addReadOverlay(id: string) {
  if (ids.has(id)) return;
  ids.add(id);
  emit();
}

export function removeReadOverlay(id: string) {
  if (!ids.has(id)) return;
  ids.delete(id);
  emit();
}

export function hasReadOverlay(id: string) {
  return ids.has(id);
}

export function listReadOverlay(): string[] {
  return [...ids];
}

export function subscribeReadOverlay(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function readOverlayVersion() {
  return version;
}
