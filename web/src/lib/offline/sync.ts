import type { OfflineQueue } from "./types";
import { toFormData } from "./serialize";

export interface SyncDeps {
  queue: OfflineQueue;
  fetchFn?: typeof fetch;
  isOnline?: () => boolean;
  endpoint?: string;
  onChange?: () => void;
  // "blocked" (401) items are only worth retrying once the session may have
  // changed — pass true on the app-load kick (which follows a login), never on
  // online/queue-changed kicks. "error" items are terminal regardless.
  retryBlocked?: boolean;
}

export interface SyncResult {
  /** Items the server accepted (2xx) in this pass. */
  synced: number;
}

/**
 * Whether the page should re-fetch server data after a sync pass. Only when
 * the server accepted something: navigator.onLine stays true on a weak signal
 * or wifi without internet, and a refresh that cannot reach the server makes
 * Next fall back to a full navigation, which lands on the offline page.
 */
export function shouldRefreshAfterSync(result: SyncResult): boolean {
  return result.synced > 0;
}

let running = false;

export async function syncQueue(deps: SyncDeps): Promise<SyncResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const endpoint = deps.endpoint ?? "/api/offline/registros";
  let synced = 0;
  if (!isOnline() || running) return { synced };
  running = true;
  try {
    const items = (await deps.queue.all())
      .filter((i) => i.status === "pending" || (i.status === "blocked" && deps.retryBlocked === true))
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
    for (const item of items) {
      await deps.queue.update(item.id, { status: "syncing" });
      deps.onChange?.();
      try {
        const res = await fetchFn(endpoint, { method: "POST", body: toFormData(item) });
        if (res.ok) {
          await deps.queue.remove(item.id);
          synced++;
        } else if (res.status === 401) {
          // Session expired. Not the user's fault and not fixable by retrying
          // the same request — the offline provider already re-runs syncQueue
          // on the next login/app load, so this clears itself automatically.
          await deps.queue.update(item.id, { status: "blocked", error: "Sesión expirada. Inicia sesión y vuelve a intentar; se sincronizará automáticamente." });
        } else if (res.status === 403) {
          // Terminal: the caller lost access to the project. Retrying changes
          // nothing until an admin restores access, so don't auto-retry.
          await deps.queue.update(item.id, { status: "error", error: "Sin acceso al proyecto." });
        } else if (res.status >= 500) {
          // Server-side failure — transient by nature, keep retrying.
          await deps.queue.update(item.id, { status: "pending", attempts: item.attempts + 1 });
        } else {
          // 400 and other 4xx: the server rejected the payload itself
          // (validation). Terminal — surface the server's own message.
          let msg = "No se pudo registrar.";
          try { msg = (await res.json())?.error ?? msg; } catch {}
          await deps.queue.update(item.id, { status: "error", error: msg });
        }
      } catch {
        // Network failure (offline, DNS, timeout…) — retryable.
        await deps.queue.update(item.id, { status: "pending", attempts: item.attempts + 1 });
      }
      deps.onChange?.();
    }
  } finally {
    running = false;
  }
  return { synced };
}
