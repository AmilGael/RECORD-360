# Phase 1 — Responsive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing page render reliably on phones (320–430px), with a drawer sidebar, scroll-contained tabs, stacked tables, 44px touch targets, safe-area support, and complete loading states — without changing the visual language.

**Architecture:** CSS-first inside `globals.css` using the existing token system; one new client component (`SidebarDrawer`) for the only behavior CSS cannot express; `data-label` attributes for the table→card transform. No new dependencies, no visual framework.

**Tech Stack:** Next.js 15 App Router, React 19, plain CSS in `web/src/app/globals.css`, vitest for what is unit-testable, `npm run build` + browser screenshots for visual verification.

## Global Constraints

- Working dir is `web/`. Full gate before every commit: `npm run -s test -- --run && npx tsc --noEmit && npm run -s lint && npm run -s build`.
- Preserve visual language: existing tokens/typography only; NO emoji (SVG line icons from `src/components/icons.tsx` or text); no new npm packages.
- Every new user-visible string goes into BOTH `es` and `en` in `src/i18n/dictionaries.ts` (shape parity is test-enforced by `tests/dictionary-labels.test.ts`).
- Motion: transform/opacity only; anything animated must respect the existing `prefers-reduced-motion` block (it already zeroes all durations globally — do not exempt anything from it).
- Do not shrink font sizes to fix overflow — wrap or let containers grow.
- The existing breakpoint for sidebar collapse is 1040px; reuse it. Phone-range breakpoint used in this plan: 640px.
- Commits: small, one per task, message style `feat(responsive): …` / `fix(responsive): …`. Do NOT push or merge — the lead reviews and lands the branch.

---

### Task 1: Safe-area + viewport configuration

**Files:**
- Modify: `web/src/app/layout.tsx:19-21` (the `viewport` export)
- Modify: `web/src/app/globals.css` (`.appbar`, `.app-shell` — appbar rule is near the `.appbar-inner` definition; app-shell at ~line 187)

**Interfaces:**
- Produces: CSS custom properties `--safe-l`/`--safe-r` consumed by later tasks' fixed-position elements (Task 2 drawer).

- [ ] **Step 1: Extend the viewport export**

In `web/src/app/layout.tsx`, replace the existing export:

```tsx
export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

- [ ] **Step 2: Add safe-area padding in globals.css**

Directly after the `* { box-sizing: border-box; }` line (~line 59), add:

```css
/* Safe-area support (notched phones). viewport-fit=cover exposes env(); these
   vars are 0 on ordinary screens so desktop is unaffected. */
:root {
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px);
  --safe-r: env(safe-area-inset-right, 0px);
}
```

Then extend the two shell rules (do not replace their other declarations):

```css
.appbar { padding-top: var(--safe-t); padding-left: var(--safe-l); padding-right: var(--safe-r); }
.app-shell { padding-left: calc(28px + var(--safe-l)); padding-right: calc(28px + var(--safe-r)); padding-bottom: calc(28px + var(--safe-b)); }
```

(`.appbar` may not currently declare padding — add these as a new rule block below its existing one so the cascade appends rather than overwrites.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run -s build`
Expected: both clean. Then `npm run dev`, open `http://localhost:3000/app` in a 390px viewport (Chrome device toolbar, iPhone 14 Pro): no horizontal scroll, content not clipped.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/layout.tsx web/src/app/globals.css
git commit -m "feat(responsive): viewport-fit=cover + safe-area insets on app shell"
```

---

### Task 2: Sidebar drawer under 1040px

Today `@media (max-width:1040px)` stacks the FULL sidebar above the page content — on a phone the user scrolls past the whole sidebar before seeing any content. Replace that with an off-canvas drawer.

**Files:**
- Create: `web/src/components/sidebar-drawer.tsx`
- Modify: `web/src/app/app/layout.tsx:46-69` (wrap `<AppSidebar…/>`)
- Modify: `web/src/app/globals.css` (replace the two `@media (max-width:1040px)` sidebar rules at ~196-198 and ~213-215; add drawer rules)
- Modify: `web/src/i18n/dictionaries.ts` (sidebar section, both locales)
- Test: visual (no component-test infra in this repo — do not add one for this)

**Interfaces:**
- Produces: `SidebarDrawer({ children, labels: { open: string; close: string } })` — a client component; server layout passes the rendered `<AppSidebar/>` as children so all existing server props flow unchanged.

- [ ] **Step 1: Add dictionary keys**

In `src/i18n/dictionaries.ts`, inside the existing `sidebar:` object of **es**:

```ts
      openMenu: "Abrir menú",
      closeMenu: "Cerrar menú",
```

and in **en**:

```ts
      openMenu: "Open menu",
      closeMenu: "Close menu",
```

- [ ] **Step 2: Create the drawer component**

`web/src/components/sidebar-drawer.tsx`:

```tsx
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
```

- [ ] **Step 3: Wrap the sidebar in the layout**

In `web/src/app/app/layout.tsx`: add `import { SidebarDrawer } from "@/components/sidebar-drawer";` and change the shell block to:

```tsx
      <div className="app-shell">
        <SidebarDrawer labels={{ open: t.sidebar.openMenu, close: t.sidebar.closeMenu }}>
          <AppSidebar
            /* …all existing props exactly as they are today… */
          />
        </SidebarDrawer>
        <main className="app-shell-main">{children}</main>
      </div>
```

(Keep every existing `AppSidebar` prop untouched — only the wrapper is new.)

- [ ] **Step 4: CSS — desktop passthrough, mobile off-canvas**

In `globals.css`, DELETE these two existing blocks:

```css
@media (max-width: 1040px) {
  .app-shell { grid-template-columns: 1fr; }
}
```
```css
@media (max-width: 1040px) {
  .app-sidebar { position: static; }
}
```

and add, near the `.app-sidebar` rules:

```css
/* ---------- sidebar drawer (Phase 1 responsive) ---------- */
/* Desktop: the wrapper is inert — sidebar renders exactly as before. */
.drawer-panel { display: contents; }
.drawer-toggle { display: none; }
.drawer-overlay { display: none; }

@media (max-width: 1040px) {
  .app-shell { grid-template-columns: 1fr; }
  .drawer-toggle {
    position: fixed; top: calc(14px + var(--safe-t)); right: calc(16px + var(--safe-r));
    z-index: 60; display: inline-flex; align-items: center; gap: 7px;
    min-height: 44px; padding: 0 14px;
    background: var(--paper-2); color: var(--ink);
    border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
    font-family: var(--font-mono), monospace; font-size: 0.68rem; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  }
  .drawer-overlay {
    display: block; position: fixed; inset: 0; z-index: 55;
    background: rgba(20, 18, 16, 0.45);
  }
  .drawer-panel {
    display: block; position: fixed; z-index: 58;
    top: 0; bottom: 0; left: 0; width: min(320px, 86vw);
    padding: calc(16px + var(--safe-t)) 0 calc(16px + var(--safe-b)) var(--safe-l);
    background: var(--paper-2); border-right: 1px solid var(--line-strong);
    transform: translateX(-100%); transition: transform 0.2s var(--ease);
    overflow-y: auto; overscroll-behavior: contain;
  }
  .drawer-panel.is-open { transform: translateX(0); }
  .drawer-panel .app-sidebar { position: static; border: none; box-shadow: none; border-radius: 0; }
}
```

(The global `prefers-reduced-motion` block already zeroes the transform transition — nothing extra needed.)

- [ ] **Step 5: Verify**

Run: `npm run -s test -- --run && npx tsc --noEmit && npm run -s lint && npm run -s build`
Expected: all green (dictionary parity test passes with both new keys).
Then in dev at 375px: content is immediately visible; toggle floats top-right; opening shows the full existing sidebar sliding in; Escape, overlay tap, and tapping a nav link all close it. At 1200px: sidebar identical to before, no toggle.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/sidebar-drawer.tsx web/src/app/app/layout.tsx web/src/app/globals.css web/src/i18n/dictionaries.ts
git commit -m "feat(responsive): off-canvas sidebar drawer under 1040px"
```

---

### Task 3: Tabs scroll-contain on phones

Tabs currently `flex-wrap` — five project tabs at 320px become a three-row stack. Keep wrap on desktop; on phones switch to controlled horizontal scrolling.

**Files:**
- Modify: `web/src/app/globals.css` (the `.tabs` rule, ~line 290)

- [ ] **Step 1: Add the mobile override**

After the existing `.tabs`/`.tab` rules:

```css
@media (max-width: 640px) {
  .tabs {
    flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* controlled scrolling, no visible bar */
    margin-inline: calc(-1 * var(--safe-l, 0px)) 0;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { white-space: nowrap; flex: 0 0 auto; }
}
```

- [ ] **Step 2: Verify**

`npm run -s build` clean. In dev at 320px on a project page: one tab row, horizontally scrollable, active-tab underline intact; at 1200px unchanged wrap behavior.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/globals.css
git commit -m "feat(responsive): tabs scroll horizontally on phones instead of stacking"
```

---

### Task 4: Dashboard table → stacked rows on phones

The only real `<table>` (dashboard "Ver tabla" view, `src/app/app/page.tsx` ~line 69) relies on `overflow-x: auto` today — functional but poor on phones. Convert to labeled stacked rows under 640px.

**Files:**
- Modify: `web/src/app/app/page.tsx` (add `className="dash-table"` to the table; add `data-label` to each `<td>`)
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Tag the table and cells**

In `page.tsx`, give the `<table>` the class `dash-table` (keep its inline styles), and add a `data-label` to every `<td>` in the body rows using the SAME dictionary strings the headers use, e.g.:

```tsx
<td data-label={D.colName}>…existing content…</td>
<td data-label={D.colCode}>…</td>
<td data-label={D.colProgress}>…</td>
<td data-label={D.colResident}>…</td>
<td data-label={D.colDate}>…</td>
```

(Exact cell contents stay untouched — only the attribute is added. `D` is already in scope in that render branch.)

- [ ] **Step 2: Stacking CSS**

```css
/* Dashboard table: stacked labeled rows on phones (Phase 1). */
@media (max-width: 640px) {
  .dash-table thead { display: none; }
  .dash-table, .dash-table tbody, .dash-table tr, .dash-table td { display: block; width: 100%; }
  .dash-table tr { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .dash-table td { border: none; padding: 3px 0; }
  .dash-table td::before {
    content: attr(data-label);
    display: block; font-family: var(--font-mono), monospace;
    font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--steel);
  }
}
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit && npm run -s build` clean. In dev: `/app?view=activas` at 375px shows each project as a labeled block (label above value, both locales correct since labels come from the dictionary); at 1200px the table is pixel-identical to before.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/app/page.tsx web/src/app/globals.css
git commit -m "feat(responsive): dashboard table stacks into labeled rows on phones"
```

---

### Task 5: Touch targets + media constraints

**Files:**
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Coarse-pointer sizing**

Add near the `.btn` rules:

```css
/* 44px minimum touch targets on touch devices only — desktop density unchanged. */
@media (pointer: coarse) {
  .btn, .tab, .sidebar-link, .sidebar-icon-button, .sidebar-signout,
  .space-link, .space-block, .input, select.input, .drawer-toggle {
    min-height: 44px;
  }
  .tab { align-items: center; }
}
video { max-width: 100%; height: auto; }
```

(`img, svg` already have `max-width: 100%` from the translation-resilience pass; `video` was the gap.)

- [ ] **Step 2: Verify**

`npm run -s build` clean. In dev with device emulation (touch): buttons/tabs/inputs measure ≥44px tall (inspect one of each); desktop with a mouse unchanged.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/globals.css
git commit -m "feat(responsive): 44px touch targets on coarse pointers; constrain video"
```

---

### Task 6: Missing loading states (pending, notifications, admin)

Three routes render nothing while their server components fetch. Reuse the existing skeleton pattern verbatim from `src/app/app/loading.tsx`.

**Files:**
- Create: `web/src/app/app/pending/loading.tsx`
- Create: `web/src/app/app/notifications/loading.tsx`
- Create: `web/src/app/app/admin/loading.tsx`

- [ ] **Step 1: Create all three files with identical content**

Each file (this is the exact existing app-level pattern — keep `aria-label="Cargando"` to match it):

```tsx
export default function Loading() {
  return (
    <div className="skel" role="status" aria-label="Cargando">
      <div className="skel-line is-title" />
      <div className="skel-line is-half" />
      <div className="skel-block" />
      <div className="skel-block" style={{ height: 220 }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

`npx tsc --noEmit && npm run -s build` clean; build output lists the three routes. In dev, throttled network: navigating to Pendientes/Notificaciones/Equipo shows the skeleton instead of a blank main area.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/app/pending/loading.tsx web/src/app/app/notifications/loading.tsx web/src/app/app/admin/loading.tsx
git commit -m "feat(responsive): loading skeletons for pending, notifications and admin routes"
```

---

### Task 7: Filters as a collapsible sheet on phones (notifications + pending)

The filter rows (5+ selects) consume most of a phone screen. Wrap each in a `<details>` that behaves as: always-open plain section on desktop, collapsed disclosure on phones. Pure CSS handles the "always open on desktop" via forced display — no client JS.

**Files:**
- Modify: `web/src/app/app/notifications/page.tsx` (~line 92, the filter `<form>`)
- Modify: `web/src/app/app/pending/page.tsx` (its filter `<form>` — same treatment)
- Modify: `web/src/app/globals.css`
- Modify: `web/src/i18n/dictionaries.ts` (both locales)

- [ ] **Step 1: Dictionary keys**

In the `notifications.filters` (`F`) section — es:

```ts
        sheetTitle: "Filtros",
```

en:

```ts
        sheetTitle: "Filters",
```

And identically in the `pendingWork` section (es `sheetTitle: "Filtros"`, en `sheetTitle: "Filters"`).

- [ ] **Step 2: Wrap both filter forms**

Pattern (notifications shown; pending is identical with its own `t` object):

```tsx
<details className="filters-sheet">
  <summary className="filters-sheet-summary">{F.sheetTitle}</summary>
  <form action="/app/notifications" …existing form exactly as-is…>
    …
  </form>
</details>
```

- [ ] **Step 3: CSS**

```css
/* Filters: plain always-visible section on desktop, disclosure on phones. */
.filters-sheet > .filters-sheet-summary { display: none; }
.filters-sheet > form { display: flex; }
@media (max-width: 640px) {
  .filters-sheet {
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    background: var(--paper-2); margin-bottom: 14px;
  }
  .filters-sheet > .filters-sheet-summary {
    display: flex; align-items: center; min-height: 44px; padding: 0 14px;
    cursor: pointer; list-style: none;
    font-family: var(--font-mono), monospace; font-size: 0.68rem;
    font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft);
  }
  .filters-sheet > .filters-sheet-summary::-webkit-details-marker { display: none; }
  .filters-sheet:not([open]) > form { display: none; }
  .filters-sheet > form { flex-direction: column; align-items: stretch; padding: 0 14px 14px; }
  .filters-sheet > form .input { width: 100%; }
}
```

Note: on desktop the `form` is forced visible whether or not the `details` is open, and the summary is hidden — so desktop behavior is exactly today's. On phones the native disclosure applies, collapsed by default.

- [ ] **Step 4: Verify**

Full gate green (dictionary parity holds). In dev at 375px: `/app/notifications` and `/app/pending` show a "Filtros" bar, tapping expands the stacked single-column filters, submitting works; at 1200px both pages look exactly as before.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/app/notifications/page.tsx web/src/app/app/pending/page.tsx web/src/app/globals.css web/src/i18n/dictionaries.ts
git commit -m "feat(responsive): collapsible filter sheet on phones for notifications and pending"
```

---

### Task 8: Phone-width audit sweep + gate

The verification task: walk every page at the plan's widths and fix anything that escaped.

**Files:**
- Modify: whatever the audit surfaces (expected: small inline-style width offenders)

- [ ] **Step 1: Audit matrix**

With `npm run dev` and Chrome device toolbar, in BOTH es and en, light and dark themes, check at **320, 360, 375, 390, 430** widths plus one landscape (e.g. 844×390): `/app`, `/app?view=activas`, `/app/pending`, `/app/notifications`, `/app/admin`, a project page (all 5 tabs), a block workspace (each space), a partida page, a request detail page, `/login`.
For each: no horizontal page scroll; no text clipped; buttons/labels inside their widgets; dialog-free flows unaffected.

- [ ] **Step 2: Fix what surfaces**

Known likely offenders to check first (fix by replacing fixed widths with `max-width: 100%` or `min(..., 100%)`):
- `cover input` in project header: `style={{ …, maxWidth: 180 }}` — fine, but confirm it wraps on 320px.
- `.space-meter { min-width: 86px }` — confirm the block workspace header wraps (it has `flex-wrap` from the earlier pass).
- `textarea` in request resolution: already `width: min(100%, 360px)`.

- [ ] **Step 3: Full gate**

Run: `npm run -s test -- --run && npx tsc --noEmit && npm run -s lint && npm run -s build`
Expected: 528+ tests pass, everything clean.

- [ ] **Step 4: Commit (only if fixes were made)**

```bash
git add -A
git commit -m "fix(responsive): phone-width audit fixes across app pages"
```

---

## Self-review notes

- Spec coverage: §10 items — drawer ✅(T2), tabs ✅(T3), tables ✅(T4), forms single-column ✅(T7 + existing 480/600/680px rules), filter sheet ✅(T7), action-group wrapping ✅(shipped previously), media ✅(T5), dialogs — the app has no modal dialogs (inline confirms only), nothing to do; safe-area ✅(T1); no fixed-width controls ✅(T8 sweep). §14 touch targets ✅(T5), drawer a11y ✅(T2: aria-expanded/controls, Escape, overlay). Loading states ✅(T6). Text scaling/zoom: covered by T8 matrix note plus existing rem-based type.
- French is explicitly OUT of Phase 1 (spec decision 1).
- No placeholders; all code inline; breakpoints consistent (1040 reused, 640 for phone-range).
