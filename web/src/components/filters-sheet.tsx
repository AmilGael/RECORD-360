"use client";
import { useState, type ReactNode } from "react";

/**
 * Filter container: plain always-visible section on desktop; on phones
 * (≤640px) a collapsed disclosure behind a toggle. A native <details> cannot
 * express "always open at some widths" — closed details suppress content via
 * ::details-content regardless of author display — hence this component.
 */
export function FiltersSheet({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="filters-sheet">
      <button
        type="button"
        className="filters-sheet-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
      </button>
      <div className={`filters-sheet-body${open ? " is-open" : ""}`}>{children}</div>
    </section>
  );
}
