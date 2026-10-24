"use client";

import { useEffect, useRef, useSyncExternalStore, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createSheetHistory } from "@/lib/ui/sheet-history";

/**
 * A slide-in side sheet: a panel on the right from 640px up, the whole screen
 * below that. Styles live in `app/app/raphel-app.css` (`.sheet-*`). Nothing
 * here stages or confirms: records are append-only, so closing loses nothing.
 *
 * The phone back gesture works through one pushed history entry per open
 * sheet (see `lib/ui/sheet-history.ts`, which also survives a StrictMode
 * remount and a fast close-then-reopen). `onClose` is read through a ref, so
 * a changing function cannot re-run the effect and pop the entry of a sheet
 * that is still open; callers still pass a stable one (`useCallback`).
 *
 * Rendered through a portal into `#sheet-root`, which the /app layout places
 * inside `.raphel-app` so the scoped tokens apply. Falls back to `document.body`
 * (unthemed) if the root is missing. Returns null until `open` and until
 * mounted on the client, so a server render with `open` true (a `?p=` deep
 * link) never touches `document`.
 */
const subscribe = () => () => {};

export function Sheet({
  open,
  title,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}): JSX.Element | null {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const trail = useRef<ReturnType<typeof createSheetHistory> | null>(null);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const shown = open && mounted;
  useEffect(() => {
    if (!shown) return;
    // An autofocused child is already inside the panel: not the opener.
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && !panel.current?.contains(active) ? active : null;
    const first = content.current?.querySelector<HTMLElement>(
      'input:not([type="file"]):not([type="hidden"]), textarea, select, button, a[href]',
    );
    if (!panel.current?.contains(document.activeElement)) {
      (first ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    }

    // A control inside that used Escape itself (a picker shutting its list)
    // claims it with preventDefault: that press is not ours.
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onCloseRef.current();
    };
    trail.current ??= createSheetHistory(window, () => onCloseRef.current());
    trail.current.push();
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      trail.current?.release();
      opener?.focus();
    };
  }, [shown]);

  if (!shown) return null;

  return createPortal(
    <div className="sheet-layer">
      <button type="button" aria-label={closeLabel} onClick={onClose} tabIndex={-1} className="sheet-backdrop" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="sheet-panel">
        <header className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost sheet-close">
            {closeLabel}
          </button>
        </header>
        <div ref={content} className="sheet-body">
          {children}
        </div>
      </div>
    </div>,
    document.getElementById("sheet-root") ?? document.body,
  );
}
