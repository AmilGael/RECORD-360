import type { QueuedRegistro, SyncErrorCode } from "./types";

export type SyncErrorLabels = Record<SyncErrorCode, string>;

/** The text for a queued item's sync error. A code wins; legacy rows still show their stored sentence. */
export function syncErrorText(item: Pick<QueuedRegistro, "errorCode" | "error">, labels: SyncErrorLabels): string {
  if (item.errorCode && labels[item.errorCode]) return labels[item.errorCode];
  return item.error ?? "";
}

/** Window event announcing that the server accepted a queued item; `detail` is its id. */
export const SYNC_ACCEPTED_EVENT = "raphl:sync-accepted";

/** SyncDeps.onAccepted for the browser: tells listeners (the composer) which item was sealed. */
export function announceAccepted(id: string): void {
  window.dispatchEvent(new CustomEvent<string>(SYNC_ACCEPTED_EVENT, { detail: id }));
}

/**
 * What the composer says about the registro it just queued:
 * - "on-device": still in this device's queue, waiting for the server;
 * - "sealed": the server accepted it (SYNC_ACCEPTED_EVENT), never inferred;
 * - "failed": the server refused it (blocked or error) — see its item;
 * - "gone": it left the queue with no acceptance seen here (discarded, or
 *   cleared elsewhere), so nothing is claimed about it.
 */
export type CaptureState =
  | { kind: "on-device" }
  | { kind: "sealed" }
  | { kind: "failed"; item: QueuedRegistro }
  | { kind: "gone" };

/** The state after reading the queue. Leaving the queue alone is not proof of a seal. */
export function nextCaptureState(prev: CaptureState, id: string, queued: QueuedRegistro[]): CaptureState {
  // Sealed is final: a queue read that started before the acceptance can
  // still resolve after it, holding the item as "syncing".
  if (prev.kind === "sealed") return prev;
  const item = queued.find((i) => i.id === id);
  if (!item) return { kind: "gone" };
  if (item.status === "blocked" || item.status === "error") return { kind: "failed", item };
  return { kind: "on-device" };
}
