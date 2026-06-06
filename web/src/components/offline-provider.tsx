"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IndexedDbQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";

let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue { if (!_queue) _queue = new IndexedDbQueue(); return _queue; }

/** Drains the offline queue on load, reconnect, and new captures. Renders nothing. */
export function OfflineProvider() {
  const router = useRouter();
  useEffect(() => {
    const onProgress = () => window.dispatchEvent(new Event("raphl:sync-progress"));
    const kick = () => {
      void syncQueue({ queue: getQueue(), onChange: onProgress }).then(() => { onProgress(); router.refresh(); });
    };
    kick();
    window.addEventListener("online", kick);
    window.addEventListener("raphl:queue-changed", kick);
    return () => {
      window.removeEventListener("online", kick);
      window.removeEventListener("raphl:queue-changed", kick);
    };
  }, [router]);
  return null;
}
