"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { popTo, previousEntry, pushEntry } from "@/lib/nav/trail";
import { readTrail, takeBackMarker, writeBackMarker, writeTrail } from "@/lib/nav/trail-storage";

/**
 * "Volver": returns to the previous in-app screen from the trail, or to
 * `fallbackHref` (the screen's logical parent, computed on the server) when
 * there is none. Never router.back(): after a deep link from email or
 * WhatsApp the browser's previous entry is outside the app.
 */
export function BackButton({ fallbackHref, labels }: { fallbackHref: string; labels: { label: string; aria: string } }) {
  const router = useRouter();

  function goBack() {
    // Counting the current screen here keeps the target right even if NavTrail
    // has not recorded this page yet.
    const trail = pushEntry(readTrail(), window.location.pathname + window.location.search);
    const target = previousEntry(trail);
    if (target && writeBackMarker(target)) {
      if (writeTrail(popTo(trail, target))) {
        router.push(target);
        return;
      }
      takeBackMarker();
    }
    router.push(fallbackHref);
  }

  return (
    <button type="button" className="btn btn-ghost btn-back" onClick={goBack} aria-label={labels.aria}>
      <ArrowLeft size={14} />
      {labels.label}
    </button>
  );
}
