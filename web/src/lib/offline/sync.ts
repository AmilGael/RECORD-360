import type { OfflineQueue } from "./types";
import { toFormData } from "./serialize";

export interface SyncDeps {
  queue: OfflineQueue;
  fetchFn?: typeof fetch;
  isOnline?: () => boolean;
  endpoint?: string;
  onChange?: () => void;
}

let running = false;

export async function syncQueue(deps: SyncDeps): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const endpoint = deps.endpoint ?? "/api/offline/registros";
  if (!isOnline() || running) return;
  running = true;
  try {
    const items = (await deps.queue.all())
      .filter((i) => i.status !== "syncing")
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
    for (const item of items) {
      await deps.queue.update(item.id, { status: "syncing" });
      deps.onChange?.();
      try {
        const res = await fetchFn(endpoint, { method: "POST", body: toFormData(item) });
        if (res.ok) {
          await deps.queue.remove(item.id);
        } else if (res.status === 401) {
          await deps.queue.update(item.id, { status: "error", error: "Sesión expirada. Inicia sesión y reintenta." });
        } else {
          let msg = "No se pudo registrar.";
          try { msg = (await res.json())?.error ?? msg; } catch {}
          await deps.queue.update(item.id, { status: "error", error: msg });
        }
      } catch {
        await deps.queue.update(item.id, { status: "pending", attempts: item.attempts + 1 });
      }
      deps.onChange?.();
    }
  } finally {
    running = false;
  }
}
