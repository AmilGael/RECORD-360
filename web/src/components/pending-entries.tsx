"use client";
import { useCallback, useEffect, useState } from "react";
import { IndexedDbQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";
import type { QueuedRegistro } from "@/lib/offline/types";
import { announceAccepted, syncErrorText, type SyncErrorLabels } from "@/lib/offline/capture-status";

let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue { if (!_queue) _queue = new IndexedDbQueue(); return _queue; }

type T = { syncTitle: string; pendingOne: string; syncing: string; retry: string; discard: string; errorTitle: string; blockedTitle: string; errors: SyncErrorLabels };

// This list is ONLY the device's local offline-capture queue (this partida's
// unsent registros) — never the operational "pendientes por resolver" queue
// (open requests/alerts/reminders, owned elsewhere). Never relabel these as
// project alerts.
export function PendingEntries({ partidaId, t }: { partidaId: string; t: T }) {
  const [items, setItems] = useState<QueuedRegistro[]>([]);
  const reload = useCallback(() => {
    void getQueue().forPartida(partidaId).then(setItems).catch(() => {});
  }, [partidaId]);
  useEffect(() => {
    reload();
    window.addEventListener("raphl:queue-changed", reload);
    window.addEventListener("raphl:sync-progress", reload);
    return () => {
      window.removeEventListener("raphl:queue-changed", reload);
      window.removeEventListener("raphl:sync-progress", reload);
    };
  }, [reload]);

  function retry(id: string) {
    void getQueue().update(id, { status: "pending", errorCode: undefined, error: undefined }).then(() => {
      reload();
      void syncQueue({ queue: getQueue(), onChange: () => window.dispatchEvent(new Event("raphl:sync-progress")), onAccepted: announceAccepted }).then(reload);
    });
  }

  function discard(id: string) {
    void getQueue().remove(id).then(() => {
      reload();
      window.dispatchEvent(new Event("raphl:sync-progress"));
    });
  }

  if (items.length === 0) return null;

  function statusLine(i: QueuedRegistro): string {
    if (i.status === "error") return [t.errorTitle, syncErrorText(i, t.errors)].filter(Boolean).join(": ");
    if (i.status === "blocked") return t.blockedTitle;
    if (i.status === "syncing") return t.syncing;
    return t.pendingOne; // "pending" — queued locally, retried automatically
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="form-label" style={{ marginBottom: 6 }}>{t.syncTitle}</div>
      {items.map((i) => (
        <div key={i.id} className="card" style={{ padding: 12, marginBottom: 8, borderStyle: "dashed", opacity: i.status === "error" || i.status === "blocked" ? 1 : 0.85 }}>
          <div style={{ fontSize: "0.9rem" }}>{i.text || "—"}</div>
          <div className="kicker" style={{ color: "var(--steel)", marginTop: 4 }}>
            {statusLine(i)}
            {i.attachments.length > 0 ? ` · ${i.attachments.length}` : ""}
          </div>
          {/* Only a terminal error (400/403) is fixable by a manual retry:
              "pending" already auto-retries in the background, and "blocked"
              (401) needs the user to log back in, not another attempt. Discard
              is the only other exit for a terminal item — the sync loop never
              picks "error" up again on its own. */}
          {i.status === "error" && (
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => retry(i.id)}>{t.retry}</button>
              <button type="button" className="btn btn-ghost" onClick={() => discard(i.id)}>{t.discard}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
