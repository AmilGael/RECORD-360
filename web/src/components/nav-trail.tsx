"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { nextTrail, normalizeEntry } from "@/lib/nav/trail";
import { readTrail, takeBackMarker, writeTrail } from "@/lib/nav/trail-storage";

/** Records in-app route changes into the per-tab trail that BackButton reads. Renders nothing. */
export function NavTrail() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // Where the last browser back/forward landed. Matched against the next route
  // change so a popstate that changes no route (hash only) is not mistaken
  // for the following ordinary navigation.
  const poppedTo = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      poppedTo.current = normalizeEntry(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const current = search ? `${pathname}?${search}` : pathname;
    const popped = poppedTo.current !== null && poppedTo.current === normalizeEntry(current);
    poppedTo.current = null;
    const backTarget = takeBackMarker();
    const change = popped
      ? ({ kind: "pop" } as const)
      : backTarget
        ? ({ kind: "back", target: backTarget } as const)
        : ({ kind: "push" } as const);
    writeTrail(nextTrail(readTrail(), current, change));
  }, [pathname, search]);

  return null;
}
