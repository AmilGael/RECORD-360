# Raphel Victor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redo `/app` in the original warm look with a Daysi-style sliding tab strip and slide-in side sheet, and apply Victor's screen requests.

**Architecture:** The look lives in one new stylesheet scoped under a `.raphel-app` class on the `/app` layout wrapper, so the landing page and auth screens keep rendering from `globals.css` untouched. Project tabs become real routes behind a shared `layout.tsx` that holds the cover header and tab strip; the old `?tab=` links redirect. One `Sheet` component hosts the Partida preview and the create forms.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma, vitest (node env, `tests/**/*.test.ts`), Playwright (`e2e/`, phone 390x844 and desktop 1280x800 projects).

**Spec:** `docs/superpowers/specs/2026-10-23-raphel-victor-redesign-design.md`. Reference code for the ported pieces: `~/Mirror/Daysi-Collection-Website-/src/components/slide-row.tsx`, `slide-row-edges.ts` (+ its test), `office/office-tabs.tsx`, `office/tabs.ts`, `office/sheet.tsx`.

Work on a branch `feat/victor-redesign` in a worktree (superpowers:using-git-worktrees). Commit after each task. Run `cd web && npm test` after every task; run the named e2e specs where a task lists them.

## Global Constraints

- Night is the first-run default (`r360_theme` cookie, `body[data-theme]`); day is the derived theme.
- Night tokens: ground `#171412`, planes `#1f1b18` / `#292420`, ink `#f1e7d8`, soft ink `#d4c7b7`, steel `#b5a998`, accent `#ff6f43` (deep `#e85a2c`), active `#5bbd8d`, merged `#a388e4`, blocked `#e06a54`, line `rgba(241,231,216,0.12)`, line-strong `rgba(241,231,216,0.22)`, grid `rgba(241,231,216,0.03)`.
- Day tokens: paper `#ECE7DD` / `#E3DDD0` / `#DBD4C5`, ink `#19140F`, soft ink `#4A433A`, accent `#E14A1F` (deep `#B83814`), line `rgba(25,20,15,0.14)`, line-strong `rgba(25,20,15,0.26)`, grid `rgba(25,20,15,0.045)`.
- Radius `10px` (`--radius`), `6px` (`--radius-sm`); soft shadows only (no hard offset shadows) inside `/app`.
- Landing page, login, activation, reset, request-access, offline screens must render exactly as today.
- Terminology is locked (`src/i18n/dictionaries.ts`): Obra, Bloque, Partida, Registro, Cuaderno, Planos, Solicitudes (the existing Cambios tab), Analitica, Informes. Every new string goes in both `es` and `en`.
- No emoji; monochrome SVG line icons (`src/components/icons.tsx`) or text only.
- State is never carried by color alone; a text label sits beside every colored state.
- Records are append-only: no staged-edit or Confirmar bar on log records.
- Animate transform or opacity only, never width or padding; everything animated stops under `prefers-reduced-motion`.
- Keep the legacy `raphl` identifiers (`raphl-offline` IndexedDB, `raphl:` events).
- Tests use `vitest` under `web/tests/*.test.ts`; imports use the `@/` alias.

## Review Focus

1. A project with no cover image (or a cover that fails to load) shows a designed placeholder, never a broken image or empty box. Pinned in Task 5.
2. Every legacy link still lands: `?tab=code&block=B&p=P`, `?tab=cambios`, `?tab=informes`, an unknown `?tab=zzz`, `tab` given twice, and notification links already stored in the database. No redirect loop. Pinned in Task 2 and Task 7.
3. The block workspace with zero partidas, or a search with zero matches, shows an empty state in the card grid rather than a blank area. Pinned in Task 9.
4. All five tabs and their Spanish labels fit at 390px without the page scrolling sideways; the strip slides instead. Pinned in Task 6.
5. Opening a Partida by deep link (`?p=<id>`), then using the browser back button or Escape, closes the sheet without leaving the block workspace or losing the active filters; offline, the preview shows the existing offline message. Pinned in Task 10.

---

## File Structure

Create:
- `web/src/lib/ui/slide-row-edges.ts`, `web/src/components/slide-row.tsx`: sideways-sliding row (ported).
- `web/src/lib/project/tabs.ts`: tab list, href builder, legacy redirect target, active-tab detection.
- `web/src/components/project-tabs.tsx`: the strip (client).
- `web/src/app/app/raphel-app.css`: all new look, scoped under `.raphel-app`.
- `web/src/components/sheet.tsx`: side sheet.
- `web/src/components/project-cover.tsx`, `web/src/lib/project/cover.ts`: cover image or placeholder.
- `web/src/app/app/projects/[id]/layout.tsx`: header + tabs.
- `web/src/app/app/projects/[id]/{planos,solicitudes,analitica,informes}/page.tsx`.
- `web/src/lib/partida/card-model.ts`, `web/src/components/partida-card-grid.tsx`, `web/src/components/partida-filter-bar.tsx`.
- `web/src/components/bloque-label.tsx`.

Modify: `web/src/app/app/layout.tsx`, `web/src/app/app/projects/[id]/page.tsx`, `web/src/app/app/(home)/page.tsx`, `web/src/components/{project-file-tree,partida-workspace,partida-panel,bloque-cards,cambios-list,analitica-tab,bloque-spaces-panel,media-galleries}.tsx`, `web/src/lib/project/space-links.ts`, `web/src/app/actions/informes.ts`, `web/src/app/app/partidas/[id]/page.tsx`, `web/src/app/app/projects/[id]/cambios/[crId]/page.tsx`, `web/src/i18n/dictionaries.ts`, `DESIGN.md`.

---

### Task 1: SlideRow

**Files:**
- Create: `web/src/lib/ui/slide-row-edges.ts`, `web/src/components/slide-row.tsx`
- Test: `web/tests/slide-row-edges.test.ts`

**Interfaces:**
- Produces: `hiddenEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean }`, `fadeMask(edges): string | undefined`, `wheelStep(wheel: {deltaX: number; deltaY: number}, scrollLeft: number, clientWidth: number, scrollWidth: number): number`, and `SlideRow({ children, className?, activeKey? })`.

- [ ] **Step 1: Port the test.** Copy Daysi's `slide-row-edges.test.ts` to `web/tests/slide-row-edges.test.ts`, import from `@/lib/ui/slide-row-edges`. Its assertions pin the values: slack of 4px, end fade `#000 calc(100% - 40px)`, start fade `#000 24px`, wheel hands back to the page when the row fits or is at that end.
- [ ] **Step 2: Run to see it fail.** `cd web && npx vitest run tests/slide-row-edges.test.ts` fails (module missing).
- [ ] **Step 3: Port the helper and the component** from Daysi unchanged in behavior (no Tailwind classes: put the three style rules inline or in `raphel-app.css` under `.raphel-app .slide-row`). The component brings `[aria-current="page"]` into view when `activeKey` changes.
- [ ] **Step 4: Run to see it pass.** Same command, PASS.
- [ ] **Step 5: Commit** `feat(nav): SlideRow tab strip helper`.

### Task 2: Project tab model

**Files:**
- Create: `web/src/lib/project/tabs.ts`
- Test: `web/tests/project-tabs.test.ts`

**Interfaces:**
- Produces: `PROJECT_TABS` (const array of `{ id, segment, labelKey }`, ids in order `partidas | planos | solicitudes | analitica | informes`, segments `""`, `"planos"`, `"solicitudes"`, `"analitica"`, `"informes"`), `type ProjectTabId`, `projectTabHref(projectId: string, tab: ProjectTabId, params?: Record<string, string | string[] | null | undefined>): string`, `legacyTabTarget(projectId: string, search: Record<string, string | string[] | undefined>): string | null`, `activeProjectTab(pathname: string, projectId: string): ProjectTabId`.

- [ ] **Step 1: Write failing tests** in `project-tabs.test.ts`:
  - `projectTabHref("P1","partidas",{block:"B"})` is `/app/projects/P1?block=B`; `"solicitudes"` is `/app/projects/P1/solicitudes`; empty and null params are dropped; arrays repeat the key.
  - `legacyTabTarget("P1",{tab:"cambios"})` is `/app/projects/P1/solicitudes`; `{tab:"code",block:"B",p:"X"}` is `/app/projects/P1?block=B&p=X` (the `tab` key is dropped); `{tab:"planos",pq:"muro"}` is `/app/projects/P1/planos?pq=muro`; `{tab:"zzz"}` is `/app/projects/P1`; `{tab:["informes","planos"]}` uses the first; `{}` and `{block:"B"}` return `null` (no `tab` key, no redirect, so no loop).
  - `activeProjectTab("/app/projects/P1","P1")` is `partidas`; `/app/projects/P1/cambios/CR9` is `solicitudes`; `/app/projects/P1/informes` is `informes`.
- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** the four exports in `tabs.ts`. The legacy map is `code→partidas`, `planos`, `cambios→solicitudes`, `analitica`, `informes`; any other value maps to `partidas`. The `partidas` index tab is an exact path match; every other tab also matches its subpaths. `cambios/<id>` counts as `solicitudes`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(nav): project tab model with legacy redirects`.

### Task 3: Scoped original look

**Files:**
- Create: `web/src/app/app/raphel-app.css`
- Modify: `web/src/app/app/layout.tsx:43` (add class and portal root), `DESIGN.md`
- Test: `web/tests/raphel-app-theme.test.ts`, `web/e2e/look-scope.spec.ts`

**Interfaces:**
- Produces: the `.raphel-app` class and a `<div id="sheet-root">` as the last child of the layout wrapper (Task 4 portals into it); CSS custom properties exactly as in Global Constraints; utility classes `.slide-row`, `.sheet-*` (Task 4) and `.pulse-band` (Task 11) live in this file.

- [ ] **Step 1: Write failing tests.** `raphel-app-theme.test.ts` reads `src/app/app/raphel-app.css` and asserts: every Global Constraints night and day token value appears under `.raphel-app` and `body[data-theme="dark"] .raphel-app`; `--radius` is `10px` and `--radius-sm` `6px`; every rule selector (ignoring comments, `@keyframes` bodies and the selectors inside `@media`) starts with `.raphel-app` or `body[data-theme="dark"] .raphel-app` (this is what keeps the landing and auth screens unchanged); the fine grid is defined for `.raphel-app.grid-bg`. `e2e/look-scope.spec.ts`: on `/login` the computed `border-radius` of the submit button stays as today, and on `/app` the `.raphel-app` wrapper's computed `--radius` is `10px`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Write `raphel-app.css` and wire it.** Import it from `app/app/layout.tsx`, add `raphel-app` to the wrapper's `className`, append `<div id="sheet-root" />`. Override under `.raphel-app` what `globals.css` hard-codes for the old look: `.btn` loses its `clip-path` chamfer and takes `--radius-sm`; cards, plates, panels, badges, chips, inputs take `--radius`/`--radius-sm`; shadows use `0 1px 2px` plus a long low-opacity drop; `.raphel-app.grid-bg` replaces the diagonal-and-noise background with the fine grid (14px cell at the `--grid` color) on the `--paper` ground. Cards never get the grid. Fraunces stays retired: Archivo for body, Chivo Mono for data labels.
- [ ] **Step 4: Rewrite `DESIGN.md`** to describe the new look (palette tables, radius and shadow rules, grid ground, tab strip and sheet components, motion rules). Remove the Plancha Industrial rules (zero radius, hard shadows, chamfer, slate); keep the marks-not-hues rule and the no-emoji rule.
- [ ] **Step 5: Run `npm test`, then `npx playwright test e2e/look-scope.spec.ts e2e/a11y.spec.ts`.** Expected: PASS; if axe flags contrast on the new palette, adjust the token (not the test).
- [ ] **Step 6: Commit** `feat(look): scoped original palette, grid ground, rounded planes for /app`.

### Task 4: Side sheet

**Files:**
- Create: `web/src/components/sheet.tsx`
- Modify: `web/src/app/app/raphel-app.css` (`.sheet-*` rules), `web/src/i18n/dictionaries.ts` (`sheet.close` in es and en)

**Interfaces:**
- Produces: `Sheet({ open: boolean; title: string; onClose: () => void; closeLabel: string; children: ReactNode })`. `onClose` must be referentially stable (document this in a comment; callers use `useCallback`).

- [ ] **Step 1: Implement** by porting Daysi's `office/sheet.tsx` without the confirm bar and Tailwind: right-hand panel `28rem` wide, full-screen below 640px; dimmed backdrop button closes; renders through `createPortal` into `document.getElementById("sheet-root") ?? document.body` (the portal root is inside `.raphel-app` so the scoped tokens apply); z-index above the sticky appbar; locks body scroll while open; focus moves to the first control (or the close button), and returns to the opener on close; Escape closes unless `defaultPrevented`; one pushed history entry per open sheet so the phone back gesture closes it, popped again if closed another way (Daysi's `closing` ref logic). Slide-in uses `transform` and is disabled under `prefers-reduced-motion`.
- [ ] **Step 2: Typecheck and lint** `cd web && npx tsc --noEmit && npm run lint`. Expected: clean. Behavior is verified by the e2e specs in Tasks 10 and 11, which are its first consumers.
- [ ] **Step 3: Commit** `feat(ui): slide-in side sheet`.

### Task 5: Project cover and projects list

**Files:**
- Create: `web/src/lib/project/cover.ts`, `web/src/components/project-cover.tsx`
- Modify: `web/src/app/app/(home)/page.tsx` (the `repo-card` block, about lines 190-240), `web/src/app/app/raphel-app.css`, `web/src/i18n/dictionaries.ts`
- Test: `web/tests/project-cover.test.ts`

**Interfaces:**
- Produces: `coverModel(coverImageKey: string | null | undefined): { kind: "image"; src: string } | { kind: "placeholder" }` (`src` is `/api/media/<key>`), and `ProjectCover({ coverImageKey, name, variant }: { …; variant: "card" | "hero" })` which renders the image with `alt=""` and `loading="lazy"` (eager for `hero`), or the placeholder: a grid-tinted plane with the existing `Folder` line icon, no text.

- [ ] **Step 1: Write failing tests:** `coverModel(null)`, `undefined` and `""` give `placeholder`; `coverModel("abc/def.jpg")` gives `{kind:"image", src:"/api/media/abc/def.jpg"}`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** `cover.ts` and `ProjectCover` (an `onError` fallback swaps the image for the placeholder).
- [ ] **Step 4: Rebuild the projects list item** as a large image with text beside it: image about 220x140 on desktop and a stacked image-above layout under 560px; the project name large; partida count, progress, last update below it; progress band along the bottom edge of the card. Archived list keeps its compact rows.
- [ ] **Step 5: Run `npm test` and `npx playwright test e2e/smoke.spec.ts`, expect PASS. Commit** `feat(projects): large cover cards on the obras list`.

### Task 6: Project layout, header and tab strip

**Files:**
- Create: `web/src/app/app/projects/[id]/layout.tsx`, `web/src/components/project-tabs.tsx`
- Modify: `web/src/app/app/projects/[id]/page.tsx` (remove the header block at about lines 447-510 and the tab links; add the legacy redirect), `web/src/app/app/raphel-app.css`, `web/src/i18n/dictionaries.ts` (`project.tabsLabel`)
- Test: `web/e2e/project-tabs.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`PROJECT_TABS`, `activeProjectTab`, `legacyTabTarget`), Task 1 (`SlideRow`), Task 5 (`ProjectCover`).
- Produces: `ProjectTabs({ projectId, labels }: { projectId: string; labels: Record<ProjectTabId, string> })` (client; reads `usePathname()`, renders a `nav` with `aria-label`, links with `aria-current="page"` on the active tab, inside `SlideRow`).

- [ ] **Step 1: Write the failing e2e** `project-tabs.spec.ts` (phone and desktop): for a seeded project, each of the five tab links navigates to its route and sets `aria-current="page"` on exactly one tab; `/app/projects/<id>?tab=cambios` redirects to `/solicitudes`; `?tab=code&block=<b>` keeps `block` and lands on the Partidas index; at 390px `document.documentElement.scrollWidth <= window.innerWidth` on every tab route, in both `es` and `en`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Build the layout.** `layout.tsx` loads a lightweight header (project scoped by `projectAccessWhere` exactly as `page.tsx` does, so a foreign id still 404s; partida count and average via `projectProgress`) and renders: the full-width `ProjectCover variant="hero"` with the name large on the right and owner, description, company, registration code and QR below it (move this JSX from `page.tsx`), the assignments panel, the owner controls (cover change, archive/restore/purge), then `ProjectTabs`. `BackButton` and `Breadcrumbs` stay in each page because a layout cannot read `searchParams`. Add a cached loader so the layout and `page.tsx` do not both run the heavy `include` query twice per request (React `cache`).
- [ ] **Step 4: In `page.tsx`**, call `legacyTabTarget` first and `redirect()` when it returns a path. Delete the old tab-link `div.tabs`; drop the disabled Settings tab.
- [ ] **Step 5: Run `npx playwright test e2e/project-tabs.spec.ts e2e/volver.spec.ts`, expect PASS. Commit** `feat(project): shared header, cover hero and sliding tab strip`.

### Task 7: Move each tab to its own route

**Files:**
- Create: `web/src/app/app/projects/[id]/planos/page.tsx`, `.../solicitudes/page.tsx`, `.../analitica/page.tsx`, `.../informes/page.tsx`
- Modify: `web/src/app/app/projects/[id]/page.tsx` (delete the branches and data loading that only those tabs used), `web/src/lib/project/space-links.ts`, `web/src/components/{project-file-tree,bloque-spaces-panel,media-galleries}.tsx`, `web/src/app/actions/informes.ts:191`, `web/src/app/app/partidas/[id]/page.tsx`, `web/src/app/app/projects/[id]/cambios/[crId]/page.tsx`
- Test: `web/tests/no-legacy-tab-links.test.ts`, existing e2e specs that mention `tab=`

**Interfaces:**
- Consumes: `projectTabHref` (Task 2).

- [ ] **Step 1: Write the failing test** `no-legacy-tab-links.test.ts`: scans every `.ts`/`.tsx` under `web/src` and fails on the literal `?tab=` or `&tab=` anywhere except `src/lib/project/tabs.ts`.
- [ ] **Step 2: Run, expect FAIL** listing the current call sites.
- [ ] **Step 3: Create the four pages.** Each loads only its own tab's data (copy the existing queries and props from `page.tsx`), applies the same access scoping and `notFound()` behavior, renders the existing component (`PlanosTab`, `CambiosList`, `AnaliticaTab`, `InformesTab`) with the same props, and includes `BackButton` and `Breadcrumbs` with `fallbackHref` `/app/projects/<id>`. Delete the moved branches from `page.tsx` so the index page is the Partidas tab only.
- [ ] **Step 4: Replace every `?tab=` link** the test lists with `projectTabHref(...)`. The `informes` action stores the new `/informes` path in new notifications; existing stored links keep working through the Task 6 redirect. Planos is already absent from the block workspace (`page.tsx` only accepts the spaces cuaderno, solicitudes, ideas, media and recordatorios, and falls back to cuaderno), so the spec's "Planos at project level only" needs no change beyond the new route.
- [ ] **Step 5: Update the e2e specs and vitest tests that assert on `tab=`** to the new routes (`grep -rn "tab=" web/e2e web/tests`).
- [ ] **Step 6: Run `npm test` and `npx playwright test e2e/project-tabs.spec.ts e2e/planos-thumbs.spec.ts e2e/analitica.spec.ts e2e/notifications-sections.spec.ts`, expect PASS. Commit** `refactor(project): one route per tab, no ?tab= links`.

### Task 8: Bloque label

**Files:**
- Create: `web/src/components/bloque-label.tsx`
- Modify: `web/src/components/{bloque-cards,analitica-tab}.tsx`, `web/src/app/app/raphel-app.css`

**Interfaces:**
- Produces: `BloqueLabel({ name, closed? }: { name: string; closed?: boolean })`: the `Layers` line icon beside the name on one baseline, the same everywhere. My call: beside, never below.

- [ ] **Step 1: Implement and use it** in `BloqueCards` (card heading), the Analitica by-bloque rows, and (Task 9) the Partida card label. A closed bloque keeps its text badge.
- [ ] **Step 2: Run `npm test` and `npx playwright test e2e/analitica.spec.ts`. Commit** `feat(ui): one consistent bloque label`.

### Task 9: Partida card grid

**Files:**
- Create: `web/src/lib/partida/card-model.ts`, `web/src/components/partida-card-grid.tsx`, `web/src/components/partida-filter-bar.tsx`
- Modify: `web/src/components/project-file-tree.tsx` (split), `web/src/components/partida-workspace.tsx`, `web/src/app/app/projects/[id]/page.tsx` (pass record counts), `web/src/app/app/raphel-app.css`
- Test: `web/tests/partida-card-model.test.ts`

**Interfaces:**
- Produces: `partidaCardModel(row: PartidaTreeRow, ctx: { lang: Lang; now: Date; blockName: string | null; recordCount: number; lastActivityAt: Date | null }): { id: string; name: string; blockName: string | null; progressPct: number; status: "concluded" | "inProgress" | "notStarted"; recordCount: number; lastUpdated: string | null; aging: "none" | "aging7" | "aging14" | "noActivity" }`, `PartidaFilterBar` (the search and facet form from `ProjectFileTree`, instant-filter and accent-insensitive behavior unchanged), `PartidaCardGrid({ cards, selectedId, onSelect, emptyLabel, t })`.
- Consumes: `activityAging` (`src/lib/partida/aging.ts`), `lastActivityByPartidaIds` (`src/lib/partida/preview.ts`); record count comes from a grouped count in the page query if the tree row does not already carry it.

- [ ] **Step 1: Write failing tests** for `partidaCardModel`: `completedAt` set gives `concluded`; `progressPct` 0 with no records gives `notStarted`; otherwise `inProgress`; `lastUpdated` is `null` when there is no activity and a formatted date otherwise; `aging` follows `activityAging`. Zero partidas is handled in the component (empty label), covered in the e2e step.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** `card-model.ts`.
- [ ] **Step 4: Split `ProjectFileTree`:** the filter form moves to `PartidaFilterBar` (search bar on top, facets kept); the folder and row list is replaced by `PartidaCardGrid`: a responsive grid of wide cards, each with the bloque name as a vertical label (`BloqueLabel` collapses to the vertical form here), partida name, record count, last-updated text, a progress band along the bottom and a status text label; selected card has the accent edge. The create-partida form leaves the tree (Task 11).
- [ ] **Step 5: Update the e2e** `e2e/partida-filter.spec.ts` and `e2e/accent-search.spec.ts` selectors; add an assertion that a block with zero partidas, and a search with zero matches, each show their empty label. Run them, expect PASS.
- [ ] **Step 6: Commit** `feat(partidas): card grid with search bar`.

### Task 10: Partida preview in the side sheet

**Files:**
- Modify: `web/src/components/partida-workspace.tsx`, `web/src/components/partida-panel.tsx`, `web/src/app/app/raphel-app.css` (remove `.workspace-panel` bottom-sheet rules for `/app`)
- Test: `web/e2e/partida-panel.spec.ts` (update)

**Interfaces:**
- Consumes: `Sheet` (Task 4), `PartidaCardGrid` (Task 9), the existing `PartidaPanelView` content.

- [ ] **Step 1: Update `partida-panel.spec.ts` first** (red): clicking a card opens a `role="dialog"` titled with the partida name; Escape closes it; the browser back button closes it and stays in the block workspace with the same `q` filter; a deep link `?p=<id>` opens it on load; on the phone project it is full-screen; with the context set offline the existing offline message shows.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Wrap `PartidaPanelView` in `Sheet`.** `?p=` stays the source of truth and is written with `replaceState`; remove `PartidaWorkspace`'s own history push (`openedByPush`) and phone bottom-sheet scroll helper (`revealRowAboveSheet`) so the sheet owns the single history entry. The sheet shows the progress control, conclude/reopen, rename, move, tags, the entries preview and an "Abrir cuaderno" link; the registro composer is not in the sheet.
- [ ] **Step 4: Run `npx playwright test e2e/partida-panel.spec.ts e2e/volver.spec.ts`, expect PASS. Commit** `feat(partidas): preview opens in the side sheet`.

### Task 11: Create forms in sheets, progress pulse

**Files:**
- Modify: `web/src/components/{cambios-list,bloque-cards,partida-workspace}.tsx`, `web/src/app/app/projects/[id]/solicitudes/page.tsx`, `web/src/app/app/raphel-app.css`, `web/src/i18n/dictionaries.ts`
- Test: `web/e2e/sheet-forms.spec.ts`, `web/tests/raphel-app-theme.test.ts` (extend)

**Interfaces:**
- Consumes: `Sheet` (Task 4); the existing `CambiosCreate`, `createPartida` and `createSegment` form actions, unchanged.

- [ ] **Step 1: Write failing tests.** `sheet-forms.spec.ts`: "Nueva solicitud" opens a sheet with the request form, submitting creates the request and it appears in the list that stays under the button; "Nueva partida" (in an open, non-closed bloque, shown to admins as today) and "Nuevo bloque" each open their form in a sheet and create the record; a closed bloque still shows the existing no-create message instead of the button. Extend `raphel-app-theme.test.ts`: `.pulse-band` exists, animates `opacity` or `transform` only, and has a `@media (prefers-reduced-motion: reduce)` override that sets `animation: none`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Move the three forms into sheets** behind buttons; the request list is already rendered under the form by `CambiosList`, so the list stays on the page and only the form moves (no new list work). Close the sheet after a successful submit.
- [ ] **Step 4: Add the progress pulse:** `.pulse-band` on `.progress-fill`, `.plate-band` and `.dash-health-fill` inside `.raphel-app`: a slow looping opacity animation that starts after the `bar-grow` entrance, off under `prefers-reduced-motion`.
- [ ] **Step 5: Run `npm test` and `npx playwright test e2e/sheet-forms.spec.ts e2e/journey-manager.spec.ts e2e/journey-resident.spec.ts`, expect PASS. Commit** `feat(ui): create forms in side sheets, pulsing progress bands`.

### Task 12: Whole-app pass

**Files:**
- Modify: whichever component or rule the pass shows is still in the old look (expected: notifications board, planos grid, informes, admin pages, pending queue).

- [ ] **Step 1: Run the full suites:** `cd web && npm test && npm run lint && npx tsc --noEmit && npx playwright test`. Expected: all pass. Fix regressions at their cause.
- [ ] **Step 2: Screenshot every `/app` route** (obras list, project index, bloque workspace with a sheet open, each of the five tabs, a solicitud detail, notifications, pending, admin) at 390px and 1280px in night and day, in `es` and `en`, and compare with `DESIGN.md`. Fix leftovers (hard shadows, square corners, slate colors) with rules under `.raphel-app`.
- [ ] **Step 3: Confirm the landing page, `/login`, `/forgot-password`, `/activate/<token>`, `/request-access` and `/offline` are visually unchanged** (compare against `main`).
- [ ] **Step 4: Commit** `style: finish the original look across /app`.
