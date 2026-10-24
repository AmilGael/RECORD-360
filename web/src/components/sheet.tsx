"use client";

import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A slide-in side sheet: a panel on the right from 640px up, the whole screen
 * below that. Styles live in `app/app/raphel-app.css` (`.sheet-*`). Nothing
 * here stages or confirms: records are append-only, so closing loses nothing.
 *
 * The phone back gesture works through one pushed history entry per open
 * sheet. The entry keeps Next's own state (spread first) so the router still
 * recognises it; closing by any other route pops that entry again. The effect
 * runs on `open` and `onClose`, so `onClose` MUST be referentially stable
 * (callers wrap it in `useCallback`): a fresh function on every render would
 * re-run the effect and pop the entry while the sheet is still open.
 *
 * Rendered through a portal into `#sheet-root`, which the /app layout places
 * inside `.raphel-app` so the scoped tokens apply. Falls back to `document.body`
 * (unthemed) if the root is missing. Returns null until `open`.
 */
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
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closing = useRef<"pop" | null>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = content.current?.querySelector<HTMLElement>(
      'input:not([type="file"]):not([type="hidden"]), textarea, select, button, a[href]',
    );
    (first ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();

    // A control inside that used Escape itself (a picker shutting its list)
    // claims it with preventDefault: that press is not ours.
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    const pop = () => {
      closing.current = "pop";
      onClose();
    };
    window.history.pushState({ ...window.history.state, sheet: true }, "");
    window.addEventListener("popstate", pop);
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("popstate", pop);
      document.body.style.overflow = overflow;
      if (closing.current !== "pop" && window.history.state?.sheet) window.history.back();
      closing.current = null;
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-layer">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="sheet-backdrop" />
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
