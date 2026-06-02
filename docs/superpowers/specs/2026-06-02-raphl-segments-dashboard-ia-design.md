# Slice: Segments + Project Dashboard IA

**Date:** 2026-06-02
**Branch context:** `feat/web-m1-core-loop` (M1 + slice A + M1 hardening + rich-logs slice already on this branch)
**Status:** Approved design, ready for implementation plan

## Context

Raphl is being grown into a "GitHub for Architects" via independent slices. This is
the **information-architecture frame**: a `Segment` grouping layer so Partidas nest
into folders, and a tabbed project *workspace* whose first tab — Code/Blueprints —
is a GitHub-style file-tree with a summary viewport.

Today the project page (`web/src/app/app/projects/[id]/page.tsx`) is a flat list of
Partidas (name + progress %) with an add-partida form. `Project → Partida` is flat.
The visual language (from slice A) is warm-editorial; the decision for this slice is
to **keep that identity and layer GitHub's structure** (tabs, status badges, mono
telemetry, denser tree) onto the office-facing project workspace — field capture
(the composer) stays calm.

## Goals

- Add a `Segment` folder layer (optional, freeform) so Partidas can nest.
- Restructure the project page into a tabbed workspace: an active **Code/Blueprints**
  tab (segment file-tree + partida summary viewport) and three **disabled stub tabs**
  (Cambios, Analítica, Ajustes) that establish the IA frame.
- Introduce the warm-tuned "GitHub structure" visual vocabulary (status badge, tabs,
  tree, mono telemetry) reusable by later slices.

## Non-Goals (deferred)

- Contents of the stub tabs (Change Requests, Analytics, Settings) — each its own slice.
- Blueprint viewer / spatial pins — own slice; lands **in the Code-tab viewport** later.
- Reassigning existing partidas between segments after creation — future nicety; this
  slice sets a partida's segment at creation only.
- Role overhaul, SLA alerts, reverse-timeline feed — separate slices.
- The top-level `/app` project list is left as-is except a trivial per-row progress %.

## Design Decisions (settled in brainstorming)

- **Segment model:** optional + freeform. A Partida may belong to a Segment or be
  ungrouped (rendered under a "Sin segmento" group). Segments are project-scoped,
  pick-or-create by name.
- **Tab scope:** Code/Blueprints fully built; Cambios/Analítica/Ajustes are visible-
  but-disabled "Próx" stubs (plain spans, not links).
- **Code-tab interaction:** two columns — left file-tree, right **summary viewport**
  for the selected partida (last-update line, progress, recent entries, open-log link).
  The blueprint viewer replaces/augments this viewport in a future slice.
- **State management:** server-driven via URL search params (`?tab=code&p=<partidaId>`)
  — the page stays an RSC; tabs and tree rows are `<Link>`s; selection is bookmarkable;
  no client state. (Rejected: a client component holding state in `useState`; rejected:
  separate routes per stub tab.)
- **Segment FK on delete:** `onDelete: SetNull` — deleting a folder *ungroups* its
  partidas (never deletes them). `segmentId` is pure organization and is **not** in any
  ledger hash, so SetNull is safe (contrast: the `Registro→Location` FK is `Restrict`
  because `locationId` *is* hash-committed).
- **Case-insensitive segment resolution** (review item B): resolve a typed segment
  label against existing segments case-insensitively and reuse the match; only create a
  new one when none matches. No title-casing (it would mangle labels like `Columnas-N1`).
- **Graceful invalid selection** (review item A): the `?p=` viewport query uses
  `findFirst` scoped to the project; an unknown/stale id falls back to the empty state.
- **Active-row highlight** (review item C): `background: var(--paper-3)` +
  `box-shadow: inset 2px 0 0 var(--accent)`.

## Schema (additive migration — no reset)

```prisma
model Segment {
  id        String     @id @default(cuid())
  projectId String
  project   Project    @relation(fields: [projectId], references: [id])
  name      String
  position  Int        @default(0)
  partidas  Partida[]
  createdAt DateTime   @default(now())

  @@unique([projectId, name])
}
```

`Partida` gains:
```prisma
  segmentId String?
  segment   Segment?  @relation(fields: [segmentId], references: [id], onDelete: SetNull)
```
`Project` gains `segments Segment[]`. Purely additive (new model + nullable FK), so the
existing (ungrouped) partida stays valid and **no DB reset is required**.

## Backend

- **`parseSegment(raw): string | null`** (`web/src/lib/registro/validate.ts`, alongside
  `parseLocation`): null/whitespace → null; otherwise trim + collapse internal runs of
  whitespace to single spaces; reject > 80 chars.
- **`resolveSegment(projectId, label): Promise<string | null>`** (new helper, e.g.
  `web/src/lib/project/segments.ts`): `null` label → null; otherwise
  `findFirst({ where: { projectId, name: { equals: label, mode: "insensitive" } } })` →
  reuse its id; else `create` with the trimmed label and return the new id.
- **`createSegment`** server action (project-scoped, same role gate as `createPartida`):
  validates with `parseSegment`, resolves (so it's idempotent), returns/revalidates.
- **`createPartida`** (extend the existing action in `web/src/app/actions/admin.ts`):
  read an optional `segment` form field → `parseSegment` → `resolveSegment` → set
  `segmentId` on create (blank → ungrouped).
- **`projectProgress(partidas): number`** pure helper: rounded average of `progressPct`
  across partidas; `0` when there are none.
- **Author name for the summary:** `Registro` has `authorId: String` with **no** `User`
  relation. The viewport resolves the latest registro's author via a separate
  `prisma.user.findUnique({ where: { id: authorId }, select: { name: true } })`
  (no schema change).

## Project page → tabbed workspace

`web/src/app/app/projects/[id]/page.tsx` (RSC), reading `searchParams` for `tab` (default
`code`) and `p` (selected partida):

- **Query:** project (tenant-scoped) including `segments` ordered by `(position asc,
  createdAt asc)` each with their `partidas` (ordered `createdAt asc`), plus ungrouped
  partidas (`segmentId: null`). Compute `projectProgress`.
- **Header:** `Fraunces` project name + **status badge** (`Active` emerald / `Archivado`
  steel from `archivedAt`) + `Space Mono` sub-line `<company.name> · N partidas · <avg>%`.
- **Tab bar:** `📁 Code` active `<Link href="?tab=code">`; `🔀 Cambios`, `📊 Analítica`,
  `⚙️ Ajustes` as disabled spans each with a `Próx` chip.
- **Code tab — left file-tree:** each segment a folder header (name, `position` order),
  partidas nested as rows linking to `?tab=code&p=<id>` (name + `progressPct`%); ungrouped
  partidas under a "Sin segmento" group. The selected row uses the active-row highlight.
  A `+ Nueva partida` form (name + a `segment` `<input list>` datalist of existing segment
  names, pick-or-create) and a `+ Segmento` form (calls `createSegment`).
- **Code tab — right viewport:** if `?p` resolves (via `findFirst` scoped to this
  project, including the latest ~3 registros with their `attachments`/`location` and the
  resolved author name), show: a `Space Mono` last-update line `<author> · <relative
  time> · <short hash>`, a progress bar, the recent registros (category badge + location
  + text snippet), and an **"Abrir bitácora completa →"** link to `/app/partidas/<id>`.
  If `?p` is missing or unresolved, show a clean empty/placeholder state.
- **i18n:** ES/EN strings for tab labels, the `Próx` chip, status badge text, `Sin
  segmento`, `+ Segmento` / segment placeholder, viewport last-update / open-log labels.

## Aesthetic (warm + structure) — `globals.css`

Add state-badge tokens tuned for warm paper:
`--state-active: #2f7d5b` on `--state-active-bg: rgba(47,125,91,.12)`;
`--state-merged: #6b4fa0` / `rgba(107,79,160,.12)` and `--state-blocked: #a8432f` /
`rgba(168,67,47,.10)` defined now for later slices. Add `.tabs`/`.tab`(+`.tab--off`/`Próx`
chip), `.tree`/`.tree-folder`/`.tree-file`(+ active-row highlight), and `.state-badge`
classes, using `Space Mono` for telemetry, `Archivo` for controls, `Fraunces` for the
project title. The composer and field-capture surfaces are untouched.

## Top-level dashboard (`/app/page.tsx`)

Minimal: add a per-row progress % (and reuse the status concept is unnecessary here).
No structural change to the project list this slice.

## Testing

TDD (pure units, test-first):
- **`parseSegment`**: null/empty/whitespace → null; trims + collapses internal whitespace;
  rejects > 80 chars.
- **`projectProgress`**: empty → 0; rounded average for a set (e.g. [40,72,100] → 71).

DB integration (extend the test suite):
- **`resolveSegment`** / `createSegment`: creating `"Cimentación"` then resolving
  `"cimentación"` returns the **same** id (case-insensitive reuse, no duplicate row);
  a brand-new label creates one row.
- **`createPartida` with a segment**: a label sets `segmentId` to the resolved segment;
  a blank label leaves `segmentId` null (ungrouped).
- Cleanup deletes registros → partidas → segments → project → user → company.

UI (no React test infra): verified via `tsc` + `npm run build` + a manual pass.

## Verification

`npm run test` (all green), `npm run lint`, `npm run build`, and a manual pass: create
two segments, add partidas into one and leave one ungrouped, confirm the file-tree nests
them (ungrouped under "Sin segmento"), select a partida and confirm the summary viewport
shows last-update/progress/recent entries + the open-log link, confirm an invalid `?p`
falls back cleanly, the three stub tabs are visibly disabled, and ES⇄EN translate.
