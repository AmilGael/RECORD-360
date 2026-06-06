# Segments + Project Dashboard IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Segment` folder layer (optional, freeform) and restructure the project page into a tabbed GitHub-style workspace — an active Code/Blueprints tab (segment file-tree + partida summary viewport) plus three disabled stub tabs — in the warm visual language.

**Architecture:** Additive migration (new `Segment` model + nullable `Partida.segmentId`), so no DB reset. The project page stays an RSC and tracks the selected partida via the `?p=<id>` URL param (bookmarkable, no client state); the tab bar is static (only Code is real this slice). New pure helpers (`parseSegment`, `projectProgress`) are TDD'd; `resolveSegment` + the actions get DB integration coverage; the file-tree and summary viewport are server components verified by build + manual pass.

**Tech Stack:** Next.js 15 (App Router, RSC, server actions, async `searchParams`), Prisma 6 + PostgreSQL (migrations), Vitest (node env, `tests/**/*.test.ts`, `@`→`src`, `.env.local`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-02-raphl-segments-dashboard-ia-design.md`

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `web/prisma/schema.prisma` | `Segment` model, `Partida.segmentId`, `Project.segments` | Modify (T1) |
| `web/src/lib/registro/validate.ts` | `parseSegment` (pure) | Modify (T2) |
| `web/tests/segment-validate.test.ts` | `parseSegment` tests | Create (T2) |
| `web/src/lib/project/progress.ts` | `projectProgress` (pure) | Create (T3) |
| `web/tests/project-progress.test.ts` | `projectProgress` tests | Create (T3) |
| `web/src/lib/project/segments.ts` | `resolveSegment` (DB, case-insensitive) | Create (T4) |
| `web/src/app/actions/admin.ts` | `createSegment`; extend `createPartida` | Modify (T4) |
| `web/tests/segments.test.ts` | DB integration: resolveSegment + createPartida w/ segment | Create (T4) |
| `web/src/i18n/dictionaries.ts` | project tab/segment/summary strings (ES/EN) | Modify (T5) |
| `web/src/app/globals.css` | state-badge tokens, `.tabs`/`.tree`/`.state-badge` classes | Modify (T5) |
| `web/src/components/project-file-tree.tsx` | left column: segment folders + partida rows + create forms | Create (T6) |
| `web/src/app/app/projects/[id]/page.tsx` | tabbed workspace: header + tabs + tree + viewport | Modify (T6, T7) |
| `web/src/components/partida-summary.tsx` | right column: selected-partida summary viewport | Create (T7) |
| `web/src/app/app/page.tsx` | per-row progress % on the project list | Modify (T8) |

All commands run from `/Users/genel/Mirror/RECORD-360/web` unless noted. `DATABASE_URL` is in `.env.local`.

---

## Task 1: Additive schema migration

Not TDD (schema). Adds the `Segment` model and the nullable FK; nothing else changes, so the build stays green.

**Files:** Modify `web/prisma/schema.prisma`

- [ ] **Step 1: Add the `Segment` model** (after the `Partida` model):

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

- [ ] **Step 2: Add `segments Segment[]` to `Project`.** Inside `model Project`, add after the `partidas Partida[]` line:

```prisma
  segments    Segment[]
```

- [ ] **Step 3: Add the nullable segment FK to `Partida`.** Inside `model Partida`, add after the `project   Project ...` relation line:

```prisma
  segmentId String?
  segment   Segment?  @relation(fields: [segmentId], references: [id], onDelete: SetNull)
```

(`SetNull` so deleting a folder ungroups its partidas — `segmentId` is organizational, not hash-committed.)

- [ ] **Step 4: Create + apply the migration, regenerate the client**

Run: `npx prisma migrate dev --name segments`
Expected: new migration folder, applied, client regenerated. If it prompts interactively or errors connecting, STOP and report BLOCKED with the output (this is additive — no reset, no data loss).

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: success (no code uses `segment*` yet).

- [ ] **Step 6: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/prisma && git commit -m "feat(db): add Segment model + nullable Partida.segmentId (additive)"
```

---

## Task 2: `parseSegment` validation (TDD)

**Files:** Create `web/tests/segment-validate.test.ts`; modify `web/src/lib/registro/validate.ts`

- [ ] **Step 1: Write the failing test** — create `web/tests/segment-validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSegment } from "@/lib/registro/validate";

describe("parseSegment", () => {
  it("returns null for empty / missing / whitespace", () => {
    expect(parseSegment(null)).toBeNull();
    expect(parseSegment("")).toBeNull();
    expect(parseSegment("   ")).toBeNull();
  });
  it("trims and collapses internal whitespace", () => {
    expect(parseSegment("  Cimentación  ")).toBe("Cimentación");
    expect(parseSegment("Nivel   1   Oeste")).toBe("Nivel 1 Oeste");
  });
  it("rejects an over-long name", () => {
    expect(() => parseSegment("x".repeat(81))).toThrow();
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `npx vitest run tests/segment-validate.test.ts`
Expected: FAIL — `parseSegment` not exported.

- [ ] **Step 3: Implement** — append to `web/src/lib/registro/validate.ts`:

```ts
/** Parse an optional segment (folder) name. Empty/whitespace → null; otherwise
 *  trimmed with internal whitespace collapsed, bounded to 80 chars. */
export function parseSegment(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().replace(/\s+/g, " ");
  if (v === "") return null;
  if (v.length > 80) {
    throw new Error("El nombre del segmento es demasiado largo (máx. 80 caracteres).");
  }
  return v;
}
```

- [ ] **Step 4: Run it (GREEN)**

Run: `npx vitest run tests/segment-validate.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/tests/segment-validate.test.ts web/src/lib/registro/validate.ts && git commit -m "feat(project): parseSegment name validation"
```

---

## Task 3: `projectProgress` helper (TDD)

**Files:** Create `web/src/lib/project/progress.ts`; create `web/tests/project-progress.test.ts`

- [ ] **Step 1: Write the failing test** — create `web/tests/project-progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectProgress } from "@/lib/project/progress";

describe("projectProgress", () => {
  it("returns 0 for no partidas", () => {
    expect(projectProgress([])).toBe(0);
  });
  it("returns the rounded average progress", () => {
    expect(projectProgress([{ progressPct: 40 }, { progressPct: 72 }, { progressPct: 100 }])).toBe(71);
  });
  it("handles a single partida", () => {
    expect(projectProgress([{ progressPct: 33 }])).toBe(33);
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `npx vitest run tests/project-progress.test.ts`
Expected: FAIL — module/function missing.

- [ ] **Step 3: Implement** — create `web/src/lib/project/progress.ts`:

```ts
/** Project-level progress = rounded average of its partidas' progressPct. 0 when empty. */
export function projectProgress(partidas: { progressPct: number }[]): number {
  if (partidas.length === 0) return 0;
  const sum = partidas.reduce((acc, p) => acc + p.progressPct, 0);
  return Math.round(sum / partidas.length);
}
```

- [ ] **Step 4: Run it (GREEN)**

Run: `npx vitest run tests/project-progress.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/lib/project/progress.ts web/tests/project-progress.test.ts && git commit -m "feat(project): projectProgress average helper"
```

---

## Task 4: `resolveSegment` + `createSegment` + extend `createPartida` (DB integration test)

**Files:** Create `web/src/lib/project/segments.ts`; modify `web/src/app/actions/admin.ts`; create `web/tests/segments.test.ts`

- [ ] **Step 1: Write the failing DB integration test** — create `web/tests/segments.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSegment } from "@/lib/project/segments";

let companyId = "", projectId = "";

beforeAll(async () => {
  const c = await prisma.company.create({ data: { name: "Seg Co" } });
  companyId = c.id;
  const p = await prisma.project.create({ data: { companyId, name: "Seg Proj" } });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("resolveSegment", () => {
  it("returns null for a null label", async () => {
    expect(await resolveSegment(projectId, null)).toBeNull();
  });

  it("creates a segment, then reuses it case-insensitively (no duplicate)", async () => {
    const id1 = await resolveSegment(projectId, "Cimentación");
    expect(id1).not.toBeNull();
    const id2 = await resolveSegment(projectId, "cimentación");
    expect(id2).toBe(id1);
    const count = await prisma.segment.count({ where: { projectId, name: { equals: "cimentación", mode: "insensitive" } } });
    expect(count).toBe(1);
  });

  it("creates a distinct segment for a new name", async () => {
    const a = await resolveSegment(projectId, "Estructura");
    const b = await resolveSegment(projectId, "Cimentación");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `npx vitest run tests/segments.test.ts`
Expected: FAIL — `resolveSegment` not exported.

- [ ] **Step 3: Implement `resolveSegment`** — create `web/src/lib/project/segments.ts`:

```ts
import { prisma } from "@/lib/db";

/**
 * Resolve a segment label to an id, scoped to a project. null → null. Matches an
 * existing segment case-insensitively (so "cimentación" reuses "Cimentación")
 * and reuses it; otherwise creates a new segment with the given (already trimmed)
 * label. Callers pass the output of parseSegment.
 */
export async function resolveSegment(projectId: string, label: string | null): Promise<string | null> {
  if (!label) return null;
  const existing = await prisma.segment.findFirst({
    where: { projectId, name: { equals: label, mode: "insensitive" } },
  });
  if (existing) return existing.id;
  const created = await prisma.segment.create({ data: { projectId, name: label } });
  return created.id;
}
```

- [ ] **Step 4: Run it (GREEN)**

Run: `npx vitest run tests/segments.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Add `createSegment` + extend `createPartida` in `web/src/app/actions/admin.ts`.** Add these imports at the top (after the existing imports):

```ts
import { parseSegment } from "@/lib/registro/validate";
import { resolveSegment } from "@/lib/project/segments";
```

Replace the existing `createPartida` function with:

```ts
export async function createPartida(formData: FormData) {
  const { companyId } = await requireAdmin();
  const projectId = String(formData.get("projectId"));
  // Cross-tenant guard: the project must belong to the caller's company.
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error("Forbidden");
  const segmentId = await resolveSegment(projectId, parseSegment(formData.get("segment")));
  await prisma.partida.create({ data: { projectId, name: String(formData.get("name")), segmentId } });
  revalidatePath(`/app/projects/${projectId}`);
}

export async function createSegment(formData: FormData) {
  const { companyId } = await requireAdmin();
  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) throw new Error("Forbidden");
  await resolveSegment(projectId, parseSegment(formData.get("name")));
  revalidatePath(`/app/projects/${projectId}`);
}
```

- [ ] **Step 6: Verify typecheck + tests + build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: tsc clean; all suites pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/lib/project/segments.ts web/src/app/actions/admin.ts web/tests/segments.test.ts && git commit -m "feat(project): resolveSegment + createSegment; createPartida accepts a segment"
```

---

## Task 5: i18n strings + warm "structure" CSS

**Files:** Modify `web/src/i18n/dictionaries.ts`, `web/src/app/globals.css`

- [ ] **Step 1: Extend the `project` dictionary (ES).** The `es.project` object currently is `{ back, newPartida, add, empty }`. Replace it with:

```ts
    project: {
      back: "OBRAS",
      newPartida: "Nueva partida (p. ej. Vaciado losa N3)",
      add: "Añadir",
      empty: "Sin partidas todavía.",
      tabCode: "Código",
      tabChanges: "Cambios",
      tabAnalytics: "Analítica",
      tabSettings: "Ajustes",
      soon: "Próx",
      statusActive: "Activo",
      statusArchived: "Archivado",
      partidasWord: "partidas",
      ungrouped: "Sin segmento",
      segmentPlaceholder: "Segmento (opcional)",
      newSegment: "Nombre del segmento",
      addSegment: "+ Segmento",
      summaryEmpty: "Selecciona una partida para ver su resumen.",
      summaryNoEntries: "Sin registros todavía.",
      lastUpdate: "última actualización",
      openLog: "Abrir bitácora completa",
    },
```

- [ ] **Step 2: Extend the `project` dictionary (EN)** to the same keys:

```ts
    project: {
      back: "SITES",
      newPartida: "New work item (e.g. Slab pour L3)",
      add: "Add",
      empty: "No work items yet.",
      tabCode: "Code",
      tabChanges: "Changes",
      tabAnalytics: "Analytics",
      tabSettings: "Settings",
      soon: "Soon",
      statusActive: "Active",
      statusArchived: "Archived",
      partidasWord: "work items",
      ungrouped: "No segment",
      segmentPlaceholder: "Segment (optional)",
      newSegment: "Segment name",
      addSegment: "+ Segment",
      summaryEmpty: "Select a work item to see its summary.",
      summaryNoEntries: "No entries yet.",
      lastUpdate: "last update",
      openLog: "Open full log",
    },
```

- [ ] **Step 3: Add the state tokens to `globals.css`.** In the `:root` block, after the `--accent-deep` line, add:

```css
  --state-active: #2f7d5b;
  --state-active-bg: rgba(47, 125, 91, 0.12);
  --state-merged: #6b4fa0;
  --state-merged-bg: rgba(107, 79, 160, 0.12);
  --state-blocked: #a8432f;
  --state-blocked-bg: rgba(168, 67, 47, 0.10);
```

- [ ] **Step 4: Append the workspace component classes to `globals.css`** (end of file):

```css
/* ---------- project workspace (GitHub structure, warm) ---------- */
.state-badge {
  font-family: var(--font-mono), monospace; font-size: 0.62rem; letter-spacing: 0.08em;
  text-transform: uppercase; font-weight: 700; padding: 2px 8px; border-radius: 999px;
}
.state-badge.is-active { color: var(--state-active); background: var(--state-active-bg); border: 1px solid rgba(47,125,91,0.35); }
.state-badge.is-archived { color: var(--steel); background: var(--paper-2); border: 1px solid var(--line-strong); }

.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin: 18px 0 0; }
.tab { font-size: 0.86rem; font-weight: 600; padding: 9px 12px; border-bottom: 2px solid transparent; color: var(--ink-soft); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.tab.is-on { color: var(--ink); border-bottom-color: var(--accent); }
.tab.is-off { color: var(--steel); opacity: 0.55; cursor: default; }
.tab .soon { font-family: var(--font-mono), monospace; font-size: 0.5rem; letter-spacing: 0.06em; border: 1px solid var(--line-strong); border-radius: 3px; padding: 0 3px; }

.workspace { display: grid; grid-template-columns: 240px 1fr; gap: 0; border: 1px solid var(--line); border-top: none; border-radius: 0 0 var(--radius) var(--radius); min-height: 360px; }
@media (max-width: 760px) { .workspace { grid-template-columns: 1fr; } }
.tree { border-right: 1px solid var(--line); padding: 10px 8px; }
@media (max-width: 760px) { .tree { border-right: none; border-bottom: 1px solid var(--line); } }
.tree-folder { font-family: var(--font-mono), monospace; font-size: 0.7rem; font-weight: 700; color: var(--ink-soft); letter-spacing: 0.03em; padding: 8px 8px 4px; }
.tree-file { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 22px; border-radius: var(--radius-sm); color: var(--ink); text-decoration: none; font-size: 0.9rem; }
.tree-file:hover { background: var(--paper-2); }
.tree-file.is-active { background: var(--paper-3); box-shadow: inset 2px 0 0 var(--accent); }
.tree-file .pct { font-family: var(--font-mono), monospace; font-size: 0.72rem; color: var(--steel); }
.tree-actions { margin-top: 12px; padding: 10px 8px 4px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }

.viewport { padding: 18px 20px; }
.viewport .telemetry { font-family: var(--font-mono), monospace; font-size: 0.72rem; color: var(--steel); letter-spacing: 0.02em; }
.viewport .empty { color: var(--steel); display: flex; align-items: center; min-height: 200px; }
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean + succeeds (new keys/classes are unused until later tasks, which is fine).

- [ ] **Step 6: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/i18n/dictionaries.ts web/src/app/globals.css && git commit -m "feat(ui): project-workspace i18n + warm state-badge/tab/tree CSS"
```

---

## Task 6: Project page → tabbed workspace shell + file-tree

Creates the file-tree component and rewrites the project page into the header + tab bar + two-column workspace. The right viewport shows the empty state in this task (the selected-partida summary lands in Task 7).

**Files:** Create `web/src/components/project-file-tree.tsx`; modify `web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Create `web/src/components/project-file-tree.tsx`:**

```tsx
import Link from "next/link";
import { createPartida, createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type PartidaRow = { id: string; name: string; progressPct: number };
type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
};

function FileRow({ projectId, pa, selectedId }: { projectId: string; pa: PartidaRow; selectedId?: string }) {
  return (
    <Link
      href={`/app/projects/${projectId}?p=${pa.id}`}
      className={`tree-file${pa.id === selectedId ? " is-active" : ""}`}
    >
      <span>{pa.name}</span>
      <span className="pct">{pa.progressPct}%</span>
    </Link>
  );
}

export function ProjectFileTree({
  projectId, segments, ungrouped, segmentNames, selectedId, t,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaRow[] }[];
  ungrouped: PartidaRow[];
  segmentNames: string[];
  selectedId?: string;
  t: TreeT;
}) {
  return (
    <div className="tree">
      {segments.map((s) => (
        <div key={s.id}>
          <div className="tree-folder">📂 {s.name}</div>
          {s.partidas.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} />)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <div className="tree-folder" style={{ opacity: 0.7 }}>▢ {t.ungrouped}</div>
          {ungrouped.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} />)}
        </div>
      )}
      <div className="tree-actions">
        <form action={createPartida} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="hidden" name="projectId" value={projectId} />
          <input name="name" placeholder={t.newPartida} required className="input" />
          <input name="segment" list="segment-options" placeholder={t.segmentPlaceholder} className="input" />
          <datalist id="segment-options">
            {segmentNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <SubmitButton className="btn btn-accent" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>{t.add}</SubmitButton>
        </form>
        <form action={createSegment} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="projectId" value={projectId} />
          <input name="name" placeholder={t.newSegment} required className="input" style={{ flex: 1 }} />
          <SubmitButton className="btn btn-ghost" style={{ padding: "0.5rem 0.7rem", fontSize: "0.78rem" }}>{t.addSegment}</SubmitButton>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/app/app/projects/[id]/page.tsx`:**

```tsx
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { ProjectFileTree } from "@/components/project-file-tree";
import { projectProgress } from "@/lib/project/progress";

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { id } = await params;
  const { p: selectedId } = await searchParams;
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const { t } = await getDict();
  const P = t.project;

  // Tenant scoping: only return the project if it belongs to the caller's company.
  const project = await prisma.project.findFirstOrThrow({
    where: { id, companyId },
    include: {
      company: { select: { name: true } },
      segments: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { partidas: { orderBy: { createdAt: "asc" } } },
      },
      partidas: { where: { segmentId: null }, orderBy: { createdAt: "asc" } },
    },
  });

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const avg = projectProgress(allPartidas);
  const segmentNames = project.segments.map((s) => s.name);

  return (
    <div className="reveal">
      <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 2px" }}>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{project.name}</h1>
        <span className={`state-badge ${project.archivedAt ? "is-archived" : "is-active"}`}>
          {project.archivedAt ? P.statusArchived : P.statusActive}
        </span>
      </div>
      <div className="mono text-steel" style={{ fontSize: "0.78rem" }}>
        {project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%
      </div>

      <div className="tabs">
        <span className="tab is-on">📁 {P.tabCode}</span>
        <span className="tab is-off">🔀 {P.tabChanges} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off">📊 {P.tabAnalytics} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off">⚙️ {P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>

      <div className="workspace">
        <ProjectFileTree
          projectId={project.id}
          segments={project.segments}
          ungrouped={project.partidas}
          segmentNames={segmentNames}
          selectedId={selectedId}
          t={{ ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add, segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment, addSegment: P.addSegment }}
        />
        <div className="viewport">
          <div className="empty">{P.summaryEmpty}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean + succeeds. (Selecting a partida changes the URL `?p=` but the viewport still shows the empty state until Task 7 — that's expected.)

- [ ] **Step 4: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/components/project-file-tree.tsx "web/src/app/app/projects/[id]/page.tsx" && git commit -m "feat(ui): project workspace shell — header, tabs, segment file-tree"
```

---

## Task 7: Selected-partida summary viewport

Adds the right-column summary for `?p=<id>`, with graceful fallback for an invalid id.

**Files:** Create `web/src/components/partida-summary.tsx`; modify `web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Create `web/src/components/partida-summary.tsx`:**

```tsx
import Link from "next/link";
import type { Registro, Attachment, Location } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

type SummaryT = { noEntries: string; lastUpdate: string; openLog: string };
type RegistroRow = Registro & { attachments: Attachment[]; location: Location | null };

export function PartidaSummary({
  partida, authorName, lang, t,
}: {
  partida: { id: string; name: string; progressPct: number; registros: RegistroRow[] };
  authorName: string | null;
  lang: Lang;
  t: SummaryT;
}) {
  const latest = partida.registros[0];
  return (
    <div className="viewport">
      {latest && (
        <div className="telemetry" style={{ marginBottom: 10 }}>
          {t.lastUpdate} · {authorName ?? "—"} · {formatTimestamp(latest.serverCreatedAt, lang)} · {latest.hash.slice(0, 8)}…{latest.hash.slice(-4)}
        </div>
      )}
      <h2 className="h-md" style={{ fontSize: "1.4rem", marginBottom: 6 }}>{partida.name}</h2>
      <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden", maxWidth: 280, marginBottom: 14 }}>
        <i style={{ display: "block", height: "100%", width: `${partida.progressPct}%`, background: "var(--accent)" }} />
      </div>
      {partida.registros.length === 0 && <p className="text-steel" style={{ fontSize: "0.88rem" }}>{t.noEntries}</p>}
      {partida.registros.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "9px 11px", marginBottom: 8, background: "var(--paper-2)" }}>
          <div className="mono text-steel" style={{ fontSize: "0.62rem", display: "flex", gap: 7, marginBottom: 4 }}>
            {r.category && <span>{r.category}</span>}
            {r.location && <span>📍 {r.location.label}</span>}
            <span>{formatTimestamp(r.serverCreatedAt, lang)}</span>
          </div>
          {r.text && <p style={{ fontSize: "0.88rem" }}>{r.text}</p>}
        </div>
      ))}
      <Link href={`/app/partidas/${partida.id}`} className="btn btn-ink" style={{ marginTop: 8, padding: "0.5rem 0.9rem", fontSize: "0.82rem" }}>
        {t.openLog} →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire selection into the page.** In `web/src/app/app/projects/[id]/page.tsx`:

(a) add imports:
```tsx
import { PartidaSummary } from "@/components/partida-summary";
```
(b) change `const { t } = await getDict();` to:
```tsx
  const { lang, t } = await getDict();
```
(c) after the `segmentNames` line, add the selected-partida lookup (graceful: `findFirst` scoped to this project; unknown id → null):
```tsx
  const selected = selectedId
    ? await prisma.partida.findFirst({
        where: { id: selectedId, projectId: id },
        include: {
          registros: {
            orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
            take: 3,
            include: { attachments: true, location: true },
          },
        },
      })
    : null;
  // Registro.authorId has no User relation; resolve the latest author's name directly.
  const latestAuthorId = selected?.registros[0]?.authorId ?? null;
  const authorName = latestAuthorId
    ? (await prisma.user.findUnique({ where: { id: latestAuthorId }, select: { name: true } }))?.name ?? null
    : null;
```
(d) replace the `<div className="viewport"><div className="empty">{P.summaryEmpty}</div></div>` block with:
```tsx
        {selected ? (
          <PartidaSummary
            partida={selected}
            authorName={authorName}
            lang={lang}
            t={{ noEntries: P.summaryNoEntries, lastUpdate: P.lastUpdate, openLog: P.openLog }}
          />
        ) : (
          <div className="viewport"><div className="empty">{P.summaryEmpty}</div></div>
        )}
```

- [ ] **Step 3: Verify typecheck + build + tests**

Run: `npx tsc --noEmit && npm run build && npm run test`
Expected: all clean/green.

- [ ] **Step 4: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/components/partida-summary.tsx "web/src/app/app/projects/[id]/page.tsx" && git commit -m "feat(ui): partida summary viewport with graceful invalid-selection fallback"
```

---

## Task 8: Dashboard per-row progress % + full verification

**Files:** Modify `web/src/app/app/page.tsx`

- [ ] **Step 1: Add a progress % to each active project row.** In `web/src/app/app/page.tsx`, the active-projects query currently selects projects without partidas. Change the `projects` query to include partida progress, and render a % next to the link.

Change the `projects` fetch to:
```tsx
  const projects = await prisma.project.findMany({
    where: { companyId: u.companyId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: { partidas: { select: { progressPct: true } } },
  });
```
Add the import at the top:
```tsx
import { projectProgress } from "@/lib/project/progress";
```
In the active-projects `.map`, replace the `<li>` body so the non-admin branch shows progress and the admin branch keeps the archive button. The `<li>` becomes:
```tsx
          <li key={p.id} className="row">
            <Link href={`/app/projects/${p.id}`} className="row-link" style={{ fontSize: "1.2rem" }}>{p.name}</Link>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="mono text-steel" style={{ fontSize: "0.8rem" }}>{projectProgress(p.partidas)}%</span>
              {isAdmin && (
                <ArchiveButton projectId={p.id} t={{ archive: D.archive, confirm: D.confirm, yes: D.yes, no: D.no }} />
              )}
            </span>
          </li>
```

- [ ] **Step 2: Full verification gate**

Run: `npx tsc --noEmit && npm run test && npm run lint && npm run build`
Expected: tsc clean; all suites pass; lint clean; build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add "web/src/app/app/page.tsx" && git commit -m "feat(ui): show per-project progress % on the dashboard"
```

- [ ] **Step 4: Manual pass (dev server)**

Run `npm run dev`, sign in (`admin@record360.do` / `demo1234`), open a project. Confirm: the header shows the project name + Active badge + `company · N partidas · avg%`; the tab bar shows Código active and three disabled "Próx" tabs; create a segment ("Cimentación"), add a partida into it (type the segment in the datalist), add a partida with no segment (appears under "Sin segmento"); typing "cimentación" lower-case reuses the same folder (no duplicate); click a partida → the right viewport shows its summary (last-update line, progress bar, recent entries, "Abrir bitácora completa →"); a bogus `?p=xxx` falls back to the empty state; toggle ES⇄EN and confirm tab/segment/summary strings translate.

- [ ] **Step 5: Done** — no commit (verification only).

---

## Self-Review

**Spec coverage:**
- `Segment` model (optional/freeform, `@@unique`, `onDelete: SetNull`) → T1. ✓
- `parseSegment` (trim/collapse/≤80) → T2. ✓
- `projectProgress` aggregate → T3. ✓
- `resolveSegment` case-insensitive reuse + `createSegment` + `createPartida` segment → T4. ✓
- i18n + warm state-badge/tab/tree CSS tokens (incl. merged/blocked for later) → T5. ✓
- Tabbed workspace: header + status badge + sub-line, Code active + 3 disabled stubs, file-tree with ungrouped "Sin segmento", create forms with segment datalist → T6. ✓
- Summary viewport (last-update + author lookup + progress + recent entries + open-log), graceful invalid `?p` via `findFirst` → T7. ✓
- Active-row highlight (`--paper-3` + accent inset) → T5 CSS `.tree-file.is-active`. ✓
- Top-level dashboard per-row progress % → T8. ✓
- Deferred items (stub-tab contents, blueprint viewer, partida reassignment, roles) → not in any task. ✓

**Placeholder scan:** every code step is complete file content or an exact, located edit; no TBD/vague steps. ✓

**Type consistency:** `parseSegment → resolveSegment(projectId, label) → segmentId` chain is consistent; `ProjectFileTree` props (`segments`/`ungrouped`/`segmentNames`/`selectedId`/`t`) match the page's query shape (`segments[].partidas`, `partidas` where `segmentId:null`); `PartidaSummary` `partida.registros` includes `attachments`+`location` matching the page's `findFirst` include; `projectProgress(partidas: {progressPct}[])` is fed `{progressPct}` selections in both the project page and the dashboard. `createSegment`/`createPartida` form field names (`projectId`, `name`, `segment`) match the tree's form inputs.

**Deviation note:** The spec mentioned a `?tab=code` param; with only the Code tab real, the tab bar is static (stub tabs are non-interactive spans) and only `?p` is used. `?tab` routing arrives with the second real tab — YAGNI for now.
