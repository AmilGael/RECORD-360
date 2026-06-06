"use client";
import { useCallback, useEffect, useState } from "react";
import { IndexedDbQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";
import type { QueuedRegistro } from "@/lib/offline/types";

let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue { if (!_queue) _queue = new IndexedDbQueue(); return _queue; }

type T = { pendingOne: string; syncing: string; retry: string; errorTitle: string };

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
    void getQueue().update(id, { status: "pending", error: undefined }).then(() => {
      reload();
      void syncQueue({ queue: getQueue(), onChange: () => window.dispatchEvent(new Event("raphl:sync-progress")) }).then(reload);
    });
  }

  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {items.map((i) => (
        <div key={i.id} className="card" style={{ padding: 12, marginBottom: 8, borderStyle: "dashed", opacity: i.status === "error" ? 1 : 0.85 }}>
          <div style={{ fontSize: "0.9rem" }}>{i.text || "—"}</div>
          <div className="kicker" style={{ color: "var(--steel)", marginTop: 4 }}>
            {i.status === "error" ? `${t.errorTitle}: ${i.error ?? ""}` : i.status === "syncing" ? t.syncing : t.pendingOne}
            {i.attachments.length > 0 ? ` · ${i.attachments.length}` : ""}
          </div>
          {i.status === "error" && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => retry(i.id)}>{t.retry}</button>
          )}
        </div>
      ))}
    </div>
  );
}
