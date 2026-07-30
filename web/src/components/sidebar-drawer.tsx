"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Off-canvas wrapper for the app sidebar on narrow viewports. Desktop
 * (>1040px) renders children as-is via CSS; the toggle and overlay only
 * exist visually below that. The sidebar itself stays a server component —
 * it is passed in as children with all its data already resolved.
 */
export function SidebarDrawer({ children, labels }: { children: ReactNode; labels: { open: string; close: string } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating (tapping a sidebar link) closes the drawer.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="drawer-toggle"
        aria-expanded={open}
        aria-controls="app-drawer"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Monochrome inline hamburger/close glyph — icon system, no emoji */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {open
            ? <path d="M3 3l10 10M13 3L3 13" />
            : <path d="M2 4h12M2 8h12M2 12h12" />}
        </svg>
        <span className="drawer-toggle-label">{open ? labels.close : labels.open}</span>
      </button>
      {open && <div className="drawer-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div id="app-drawer" className={`drawer-panel${open ? " is-open" : ""}`}>
        {children}
      </div>
    </>
  );
}
