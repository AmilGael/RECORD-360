"use client";
import { useEffect, useState } from "react";
import { IndexedDbQueue } from "@/lib/offline/queue";

let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue { if (!_queue) _queue = new IndexedDbQueue(); return _queue; }

export function SyncIndicator({ t }: { t: { pending: string } }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const reload = () => { void getQueue().pendingCount().then(setCount).catch(() => {}); };
    reload();
    window.addEventListener("raphl:queue-changed", reload);
    window.addEventListener("raphl:sync-progress", reload);
    return () => {
      window.removeEventListener("raphl:queue-changed", reload);
      window.removeEventListener("raphl:sync-progress", reload);
    };
  }, []);
  if (count === 0) return null;
  return <span className="kicker" style={{ color: "var(--steel)" }} aria-live="polite">{count} {t.pending}</span>;
}
