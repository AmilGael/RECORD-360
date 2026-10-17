import type { QueuedRegistro } from "./types";

export type SyncErrorLabels = { sessionExpired: string; forbidden: string };

/** The text for a queued item's sync error, in the user's language when the client made it. */
export function syncErrorText(item: Pick<QueuedRegistro, "errorCode" | "error">, labels: SyncErrorLabels): string {
  if (item.errorCode === "session_expired") return labels.sessionExpired;
  if (item.errorCode === "forbidden") return labels.forbidden;
  return item.error ?? "";
}

/**
 * What the composer says about the registro it just queued:
 * - "on-device": still in this device's queue, waiting for the server;
 * - "sealed": it left the queue, which only a 2xx from the server does;
 * - "failed": the server refused it (blocked or error) — see its item;
 * - "gone": it left the queue after failing, i.e. the user discarded it.
 */
export type CaptureState =
  | { kind: "on-device" }
  | { kind: "sealed" }
  | { kind: "failed"; item: QueuedRegistro }
  | { kind: "gone" };

export function nextCaptureState(prev: CaptureState, id: string, queued: QueuedRegistro[]): CaptureState {
  const item = queued.find((i) => i.id === id);
  if (!item) return prev.kind === "failed" || prev.kind === "gone" ? { kind: "gone" } : { kind: "sealed" };
  if (item.status === "blocked" || item.status === "error") return { kind: "failed", item };
  return { kind: "on-device" };
}
