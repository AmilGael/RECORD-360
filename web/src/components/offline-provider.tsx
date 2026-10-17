"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IndexedDbQueue } from "@/lib/offline/queue";
import { shouldRefreshAfterSync, syncQueue } from "@/lib/offline/sync";

let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue { if (!_queue) _queue = new IndexedDbQueue(); return _queue; }

/** Drains the offline queue on load, reconnect, and new captures. Renders nothing. */
export function OfflineProvider() {
  const router = useRouter();
  useEffect(() => {
    const onProgress = () => window.dispatchEvent(new Event("raphl:sync-progress"));
    const kick = (retryBlocked = false) => {
      void syncQueue({ queue: getQueue(), onChange: onProgress, retryBlocked }).then((result) => {
        onProgress();
        if (shouldRefreshAfterSync(result)) router.refresh();
      });
    };
    // Mount follows a fresh page load (and therefore any login), so this is
    // the one kick where retrying "blocked" (session-expired) items makes sense.
    kick(true);
    const onKick = () => kick();
    window.addEventListener("online", onKick);
    window.addEventListener("raphl:queue-changed", onKick);
    return () => {
      window.removeEventListener("online", onKick);
      window.removeEventListener("raphl:queue-changed", onKick);
    };
  }, [router]);
  return null;
}
