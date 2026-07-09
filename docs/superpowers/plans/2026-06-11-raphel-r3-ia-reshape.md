# Raphel R3 — IA Reshape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R3: project page shows bloques-only + WhatsApp-style media galleries (partida tree moves one click deeper, into the bloque view), per-project similarity search, bloque delete with double confirmation, dashboard rework (dual chart-buttons → sortable general table, portfolio analytics removed), and Amazon-style partida facet filters.

**Architecture:** The project page keeps ONE route with two layouts keyed on the existing `?block=` param: no-block → bloque cards + search + galleries; with-block → today's workspace (tree/summary/spaces/recycle) scoped to that bloque. `filterPartidaGroups` grows facet inputs (pure function, TDD). New `lib/project/search.ts` does the grouped similarity search (TDD). `deleteSegment` mirrors the purge-action pattern (empty-only, audited, `delete.permanent` notification, TDD). The dashboard's portfolio analytics section is deleted (its widgets live in each obra's Analítica — parity verified) and replaced by two stat-buttons that open a sortable table view.

**Tech Stack:** Next.js 15 App Router (server components, searchParams-driven), Prisma 6, vitest (real Postgres, `vi.mock("@/auth")`).

**Spec:** `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md` §R3
**Working directory:** `/Users/genel/Mirror/RECORD-360/web`. Branch: `feat/web-security-hardening`.

**Hard rules:** every string in BOTH `es`/`en` dictionaries; NO emoji (icons.tsx only); all queries through `projectAccessWhere`; **nothing the architect already approved is lost** — the partida tree, spaces panel, recycle bin, composer all survive inside the bloque view.

**Out of scope (explicit):** signed-R2-URL media delivery (needs the real bucket — lands with provisioning); pg_trgm index (ILIKE `contains` is v1 per spec).

---

### Task 1: Project similarity search (TDD)

**Files:**
- Create: `src/lib/project/search.ts`
- Test: `tests/project-search.test.ts`

- [ ] **Step 1: Failing test** — create `tests/project-search.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { searchProject } from "@/lib/project/search";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", outCompanyId = "", managerId = "", outsiderId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `PS Co ${s}` } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `PS Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr PS", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `PS Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Plomeria nivel 3" } })).id;
  await appendRegistro({ partidaId, authorId: managerId, text: "Fuga de agua reparada en plomeria", category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] } as Parameters<typeof appendRegistro>[0]);
  await prisma.document.create({ data: { projectId, kind: "PLANO", title: "Plano plomeria sanitaria", url: "/api/media/ps-doc.pdf", sha256: "x", fileType: "PDF", uploadedById: managerId } });
  await prisma.changeRequest.create({ data: { projectId, code: "SC-PS1", title: "Cambiar tuberia de plomeria", authorId: managerId, reminderDueAt: new Date("2027-01-01") } });
});

afterAll(async () => {
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

const mgr = () => ({ id: managerId, companyId, role: "MANAGER" as const });

describe("searchProject", () => {
  it("matches across partidas, registros, documentos and cambios, case-insensitive", async () => {
    const r = await searchProject(mgr(), projectId, "PLOMERIA");
    expect(r!.partidas.map((p) => p.name)).toContain("Plomeria nivel 3");
    expect(r!.registros[0]!.text).toContain("plomeria");
    expect(r!.documentos[0]!.title).toContain("plomeria");
    expect(r!.cambios[0]!.title).toContain("plomeria");
  });
  it("no match → empty groups, never null for accessible project", async () => {
    const r = await searchProject(mgr(), projectId, "inexistente-xyz");
    expect(r).toEqual({ partidas: [], registros: [], documentos: [], cambios: [] });
  });
  it("blank query → empty groups (no full dump)", async () => {
    const r = await searchProject(mgr(), projectId, "   ");
    expect(r).toEqual({ partidas: [], registros: [], documentos: [], cambios: [] });
  });
  it("cross-tenant → null", async () => {
    const r = await searchProject({ id: outsiderId, companyId: outCompanyId, role: "MANAGER" }, projectId, "plomeria");
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run tests/project-search.test.ts`

- [ ] **Step 3: Implement** — create `src/lib/project/search.ts`:

```ts
import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";

export type ProjectSearchResults = {
  partidas: { id: string; name: string }[];
  registros: { id: string; partidaId: string; partidaName: string; text: string | null; serverCreatedAt: Date }[];
  documentos: { id: string; title: string | null; url: string; kind: string }[];
  cambios: { id: string; code: string; title: string }[];
};

const LIMIT = 10;

/**
 * Windows-style similarity search inside one obra (spec R3.2): one query string
 * matched (contains, case-insensitive) against partida names, registro text,
 * document titles, and cambio title/description. Returns null when the obra
 * isn't visible to the caller; empty groups for blank/no-match queries.
 */
export async function searchProject(user: SessionUser, projectId: string, q: string): Promise<ProjectSearchResults | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere(user) }, select: { id: true } });
  if (!project) return null;
  const query = q.trim();
  const empty: ProjectSearchResults = { partidas: [], registros: [], documentos: [], cambios: [] };
  if (!query) return empty;

  const contains = { contains: query, mode: "insensitive" as const };
  const [partidas, registros, documentos, cambios] = await Promise.all([
    prisma.partida.findMany({ where: { projectId, deletedAt: null, name: contains }, take: LIMIT, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.registro.findMany({
      where: { partida: { projectId, deletedAt: null }, text: contains },
      take: LIMIT, orderBy: { serverCreatedAt: "desc" },
      select: { id: true, partidaId: true, text: true, serverCreatedAt: true, partida: { select: { name: true } } },
    }),
    prisma.document.findMany({ where: { projectId, title: contains }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, title: true, url: true, kind: true } }),
    prisma.changeRequest.findMany({ where: { projectId, OR: [{ title: contains }, { description: contains }] }, take: LIMIT, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true } }),
  ]);
  return {
    partidas,
    registros: registros.map((r) => ({ id: r.id, partidaId: r.partidaId, partidaName: r.partida.name, text: r.text, serverCreatedAt: r.serverCreatedAt })),
    documentos,
    cambios,
  };
}
```

- [ ] **Step 4: Run — pass; commit**

```bash
npx vitest run tests/project-search.test.ts
git add -A && git commit -m "feat(r3): per-obra similarity search across partidas, registros, documentos, cambios (R3.2)"
```

---

### Task 2: Bloque delete action (TDD)

**Files:**
- Modify: `src/app/actions/admin.ts` (new `deleteSegment` after `createSegment`)
- Test: `tests/segment-delete.test.ts`

Policy (matches obra/partida purges): ADMIN-only · empty-only (no partidas — including soft-deleted ones —, no documents, no change-request links) · audited · `delete.permanent` notification to staff + assigned users (excluding actor, excluding disabled).

- [ ] **Step 1: Failing test** — create `tests/segment-delete.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteSegment } from "@/app/actions/admin";

let companyId = "", adminId = "", managerId = "", projectId = "";

function fd(segmentId: string) {
  const f = new FormData();
  f.set("segmentId", segmentId);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `SD Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm SD", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr SD", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `SD Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("deleteSegment", () => {
  it("ADMIN deletes an empty bloque; audit + notification written", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Vacio" } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await deleteSegment(fd(seg.id));
    expect(await prisma.segment.findUnique({ where: { id: seg.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { companyId, action: "segment.purge", targetId: seg.id } });
    expect(audit).not.toBeNull();
    const note = await prisma.notification.findFirst({ where: { userId: managerId, type: "delete.permanent", title: { contains: "Bloque Vacio" } } });
    expect(note).not.toBeNull();
  });
  it("refuses when the bloque has partidas (even soft-deleted)", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Con Partidas" } });
    await prisma.partida.create({ data: { projectId, segmentId: seg.id, name: "P1", deletedAt: new Date() } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(deleteSegment(fd(seg.id))).rejects.toThrow(/contiene/i);
  });
  it("refuses when documents hang off the bloque", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Con Docs" } });
    await prisma.document.create({ data: { projectId, segmentId: seg.id, kind: "PLANO", url: "/api/media/sd.pdf", sha256: "x", fileType: "PDF", uploadedById: adminId } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(deleteSegment(fd(seg.id))).rejects.toThrow(/contiene/i);
    await prisma.document.deleteMany({ where: { segmentId: seg.id } });
  });
  it("MANAGER cannot delete bloques", async () => {
    const seg = await prisma.segment.create({ data: { projectId, name: "Bloque Mgr" } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(deleteSegment(fd(seg.id))).rejects.toThrow(/Forbidden/);
  });
});
```

- [ ] **Step 2: Run — fail.** Then implement in `src/app/actions/admin.ts` (after `createSegment`; `createNotifications` and `writeAudit` are already imported there — verify):

```ts
// Permanent bloque delete (R3.3). Same policy family as purgeProject/purgePartida:
// ADMIN-only, empty-only (no partidas incl. recycled, no documents, no cambios links),
// audited, and notified as delete.permanent.
export async function deleteSegment(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const segmentId = String(formData.get("segmentId"));
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, project: { companyId } },
    select: { id: true, name: true, projectId: true },
  });
  if (!segment) throw new Error("Forbidden");

  const [partidas, documents, crLinks] = await Promise.all([
    prisma.partida.count({ where: { segmentId } }), // includes soft-deleted — history must move first
    prisma.document.count({ where: { segmentId } }),
    prisma.changeRequestSegment.count({ where: { segmentId } }),
  ]);
  if (partidas > 0 || documents > 0 || crLinks > 0) {
    throw new Error("No se puede borrar: el bloque contiene partidas, documentos o cambios. Muevelos o borralos primero.");
  }

  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: segment.projectId }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: actorId }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((uid) => uid !== actorId);

  await prisma.$transaction(async (tx) => {
    await tx.segment.delete({ where: { id: segment.id } });
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "segment.purge",
      targetType: "Segment",
      targetId: segment.id,
      summary: `Bloque borrado definitivamente: ${segment.name}`,
      metadata: { projectId: segment.projectId },
    });
  });
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Bloque borrado definitivamente: ${segment.name}`,
    body: `Borrado por ${actor?.name ?? "—"}.`,
  })));
  revalidatePath(`/app/projects/${segment.projectId}`);
}
```

- [ ] **Step 3: Run — pass; full suite; commit**

```bash
npx vitest run tests/segment-delete.test.ts && npm test
git add -A && git commit -m "feat(r3): bloque permanent delete — ADMIN-only, empty-only, audited + notified (R3.3)"
```

---

### Task 3: Partida facet filters — pure function (TDD)

**Files:**
- Modify: `src/lib/project/partida-filter.ts`
- Test: extend `tests/partida-filter.test.ts` if it exists (check `ls tests/ | grep -i filter`); otherwise create `tests/partida-facets.test.ts`

- [ ] **Step 1: Failing tests** — create `tests/partida-facets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterPartidaGroups } from "@/lib/project/partida-filter";

type P = { name: string; progressPct?: number; createdAt?: Date; tagNames?: string[]; hasOpenCambios?: boolean };
const seg = (id: string, name: string, partidas: P[]) => ({ id, name, partidas });

const A = seg("a", "Bloque A", [
  { name: "Zapatas", progressPct: 80, createdAt: new Date("2026-01-10"), tagNames: ["Mamposteria"], hasOpenCambios: true },
  { name: "Muros", progressPct: 20, createdAt: new Date("2026-03-10"), tagNames: ["Diseno"], hasOpenCambios: false },
]);
const U: P[] = [{ name: "Limpieza", progressPct: 50, createdAt: new Date("2026-02-10"), tagNames: [], hasOpenCambios: false }];

describe("facet filters (R3.5)", () => {
  it("tags facet ORs within the facet", () => {
    const r = filterPartidaGroups([A], U, { tags: ["Mamposteria", "Ebanisteria"] });
    expect(r.total).toBe(1);
    expect(r.segments[0]!.partidas[0]!.name).toBe("Zapatas");
  });
  it("progress range is inclusive", () => {
    const r = filterPartidaGroups([A], U, { progressMin: 20, progressMax: 50 });
    expect(r.total).toBe(2); // Muros 20, Limpieza 50
  });
  it("openCambios facet keeps only partidas with open cambios", () => {
    const r = filterPartidaGroups([A], U, { openCambios: true });
    expect(r.total).toBe(1);
    expect(r.segments[0]!.partidas[0]!.name).toBe("Zapatas");
  });
  it("created date range filters by createdAt", () => {
    const r = filterPartidaGroups([A], U, { createdFrom: new Date("2026-02-01"), createdTo: new Date("2026-04-01") });
    expect(r.total).toBe(2); // Muros (mar), Limpieza (feb)
  });
  it("facets compose with query and report hasFilters", () => {
    const r = filterPartidaGroups([A], U, { query: "mu", progressMax: 30 });
    expect(r.total).toBe(1);
    expect(r.hasFilters).toBe(true);
  });
  it("absent facet fields on partidas never crash (backwards compatible)", () => {
    const r = filterPartidaGroups([seg("b", "B", [{ name: "Solo nombre" }])], [], { progressMin: 10 });
    expect(r.total).toBe(0); // unknown progress can't satisfy a progress facet
  });
});
```

- [ ] **Step 2: Run — fail.** Then extend `src/lib/project/partida-filter.ts` — replace `PartidaFilterInput`, `PartidaLike` and `matchesQuery` usage:

```ts
export type PartidaFilterInput = {
  query?: string | null;
  segmentId?: string | null;
  tags?: string[] | null;
  progressMin?: number | null;
  progressMax?: number | null;
  openCambios?: boolean | null;
  createdFrom?: Date | null;
  createdTo?: Date | null;
};

type PartidaLike = {
  name: string;
  progressPct?: number;
  createdAt?: Date;
  tagNames?: string[];
  hasOpenCambios?: boolean;
};
```

and inside `filterPartidaGroups`, replace `matchesQuery` with a composed matcher (keep everything else — segment filtering, ungrouped logic, totals — identical):

```ts
  const tags = (filters.tags ?? []).filter(Boolean);
  const matches = (p: TPartida) => {
    if (query && !p.name.toLowerCase().includes(query)) return false;
    if (tags.length && !tags.some((tg) => (p.tagNames ?? []).includes(tg))) return false;
    if (filters.progressMin != null && !(typeof p.progressPct === "number" && p.progressPct >= filters.progressMin)) return false;
    if (filters.progressMax != null && !(typeof p.progressPct === "number" && p.progressPct <= filters.progressMax)) return false;
    if (filters.openCambios && !p.hasOpenCambios) return false;
    if (filters.createdFrom && !(p.createdAt && p.createdAt >= filters.createdFrom)) return false;
    if (filters.createdTo && !(p.createdAt && p.createdAt <= filters.createdTo)) return false;
    return true;
  };
  const filterPartidas = (rows: TPartida[]) => rows.filter(matches);
```

and the `hasFilters` line becomes:

```ts
  const hasFilters = Boolean(
    query || segmentId || tags.length || filters.progressMin != null || filters.progressMax != null ||
    filters.openCambios || filters.createdFrom || filters.createdTo,
  );
```

- [ ] **Step 3: Run new + existing filter tests + full suite; commit**

```bash
npx vitest run tests/partida-facets.test.ts && npm test
git add -A && git commit -m "feat(r3): partida facet filters — tags, progress range, open cambios, dates (R3.5 core)"
```

---

### Task 4: Project page reshape — bloque cards, search results, galleries (R3.1 + R3.2 UI)

**Files:**
- Create: `src/components/bloque-cards.tsx`, `src/components/project-search-results.tsx`, `src/components/media-galleries.tsx`, `src/components/delete-segment-button.tsx`
- Modify: `src/app/app/projects/[id]/page.tsx`, `src/i18n/dictionaries.ts`

LAYOUT CONTRACT: `?block=` is the existing param. **No block param** → bloques overview (cards + obra search + galleries). **`?block=<id|__ungrouped>`** → today's full workspace (file tree filtered to that bloque, partida summary, spaces panel preselected to it, recycle bin) plus a back link. The existing `selectedSpaceBlock` logic should derive from `?block` when present.

- [ ] **Step 1: Dictionary.** ES `project` block adds:

```ts
      bloquesTitle: "Bloques",
      bloqueCard: "partidas",
      openBloque: "Ver bloque",
      backToBloques: "Volver a bloques",
      deleteBloque: "Borrar bloque",
      deleteBloqueConfirm: "¿Borrar este bloque definitivamente?",
      bloqueNotEmpty: "Solo se pueden borrar bloques vacíos.",
      searchObra: "Buscar en toda la obra…",
      searchResults: "Resultados",
      searchNoResults: "Nada coincide con la búsqueda.",
      searchInPartidas: "Partidas",
      searchInRegistros: "Registros",
      searchInDocumentos: "Documentos",
      searchInCambios: "Cambios",
      mediaTitle: "Archivos de la obra",
      mediaFotos: "Fotos",
      mediaVideos: "Videos",
      mediaDocumentos: "Documentos",
      mediaAudio: "Audio",
      mediaEmpty: "Sin archivos de este tipo todavía.",
```

EN:

```ts
      bloquesTitle: "Blocks",
      bloqueCard: "work items",
      openBloque: "Open block",
      backToBloques: "Back to blocks",
      deleteBloque: "Delete block",
      deleteBloqueConfirm: "Delete this block permanently?",
      bloqueNotEmpty: "Only empty blocks can be deleted.",
      searchObra: "Search the whole site…",
      searchResults: "Results",
      searchNoResults: "Nothing matches the search.",
      searchInPartidas: "Work items",
      searchInRegistros: "Entries",
      searchInDocumentos: "Documents",
      searchInCambios: "Changes",
      mediaTitle: "Site files",
      mediaFotos: "Photos",
      mediaVideos: "Videos",
      mediaDocumentos: "Documents",
      mediaAudio: "Audio",
      mediaEmpty: "No files of this type yet.",
```

- [ ] **Step 2: DeleteSegmentButton** — create `src/components/delete-segment-button.tsx` (the double-confirm pattern from `purge-project-button.tsx`, but for segments):

```tsx
"use client";
import { useState } from "react";
import { deleteSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Trash } from "@/components/icons";

type T = { deleteBloque: string; deleteBloqueConfirm: string; yes: string; no: string };

export function DeleteSegmentButton({ segmentId, t }: { segmentId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn btn-danger-soft mono" style={{ padding: "0.22rem 0.6rem", fontSize: "0.64rem", letterSpacing: "0.08em" }}>
        <Trash size={10} style={{ verticalAlign: -1, marginRight: 4 }} />{t.deleteBloque}
      </button>
    );
  }
  return (
    <form action={deleteSegment} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="segmentId" value={segmentId} />
      <span className="mono" style={{ fontSize: "0.66rem", color: "var(--accent-deep)" }}>{t.deleteBloqueConfirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.22rem 0.6rem", fontSize: "0.68rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.22rem 0.6rem", fontSize: "0.68rem" }}>{t.no}</button>
    </form>
  );
}
```

- [ ] **Step 3: BloqueCards** — create `src/components/bloque-cards.tsx` (server component):

```tsx
import Link from "next/link";
import { createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { DeleteSegmentButton } from "@/components/delete-segment-button";
import { Layers, Plus } from "@/components/icons";
import { UNGROUPED_FILTER } from "@/lib/project/partida-filter";

export type BloqueCard = { id: string; name: string; progress: number; count: number; deletable: boolean };

type T = {
  bloquesTitle: string; bloqueCard: string; openBloque: string; ungrouped: string;
  newSegment: string; addSegment: string; deleteBloque: string; deleteBloqueConfirm: string; yes: string; no: string;
};

export function BloqueCards({ projectId, bloques, ungroupedCount, canEdit, isOwner, t }: {
  projectId: string;
  bloques: BloqueCard[];
  ungroupedCount: number;
  canEdit: boolean;
  isOwner: boolean;
  t: T;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>{t.bloquesTitle}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {bloques.map((b) => (
          <div key={b.id} className="card" style={{ padding: 14 }}>
            <Link href={`/app/projects/${projectId}?block=${b.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Layers size={14} />
                <strong>{b.name}</strong>
              </div>
              <div className="mono text-steel" style={{ fontSize: "0.72rem", marginBottom: 8 }}>
                {b.count} {t.bloqueCard} · {b.progress}%
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className={`progress-fill${b.progress >= 100 ? " is-done" : ""}`} style={{ width: `${b.progress}%` }} />
              </div>
            </Link>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <Link href={`/app/projects/${projectId}?block=${b.id}`} className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)", textDecoration: "none" }}>
                {t.openBloque}
              </Link>
              {isOwner && b.deletable && (
                <DeleteSegmentButton segmentId={b.id} t={{ deleteBloque: t.deleteBloque, deleteBloqueConfirm: t.deleteBloqueConfirm, yes: t.yes, no: t.no }} />
              )}
            </div>
          </div>
        ))}
        {ungroupedCount > 0 && (
          <Link href={`/app/projects/${projectId}?block=${UNGROUPED_FILTER}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Layers size={14} />
              <strong>{t.ungrouped}</strong>
            </div>
            <div className="mono text-steel" style={{ fontSize: "0.72rem" }}>{ungroupedCount} {t.bloqueCard}</div>
          </Link>
        )}
        {canEdit && (
          <form action={createSegment} className="card" style={{ padding: 14, display: "grid", gap: 8, alignContent: "start" }}>
            <input type="hidden" name="projectId" value={projectId} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={12} /><span className="form-label" style={{ margin: 0 }}>{t.addSegment}</span></div>
            <input name="name" required placeholder={t.newSegment} className="input" />
            <SubmitButton className="btn btn-ghost" style={{ justifySelf: "start" }}>{t.addSegment}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ProjectSearchResults** — create `src/components/project-search-results.tsx` (server component, renders `ProjectSearchResults` groups; every item links to its surface):

```tsx
import Link from "next/link";
import type { ProjectSearchResults as Results } from "@/lib/project/search";

type T = { searchResults: string; searchNoResults: string; searchInPartidas: string; searchInRegistros: string; searchInDocumentos: string; searchInCambios: string };

export function ProjectSearchResultsPanel({ projectId, results, t }: { projectId: string; results: Results; t: T }) {
  const empty = !results.partidas.length && !results.registros.length && !results.documentos.length && !results.cambios.length;
  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>{t.searchResults}</div>
      {empty && <p className="mono text-steel" style={{ fontSize: "0.78rem", margin: 0 }}>{t.searchNoResults}</p>}
      {results.partidas.length > 0 && (
        <Group label={t.searchInPartidas}>
          {results.partidas.map((p) => (
            <Link key={p.id} href={`/app/partidas/${p.id}`} className="search-hit">{p.name}</Link>
          ))}
        </Group>
      )}
      {results.registros.length > 0 && (
        <Group label={t.searchInRegistros}>
          {results.registros.map((r) => (
            <Link key={r.id} href={`/app/partidas/${r.partidaId}`} className="search-hit">
              <span className="mono text-steel">[{r.partidaName}]</span> {(r.text ?? "").slice(0, 110)}
            </Link>
          ))}
        </Group>
      )}
      {results.documentos.length > 0 && (
        <Group label={t.searchInDocumentos}>
          {results.documentos.map((d) => (
            <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="search-hit">{d.title ?? d.url.split("/").pop()}</a>
          ))}
        </Group>
      )}
      {results.cambios.length > 0 && (
        <Group label={t.searchInCambios}>
          {results.cambios.map((c) => (
            <Link key={c.id} href={`/app/projects/${projectId}/cambios/${c.id}`} className="search-hit">{c.code} · {c.title}</Link>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="form-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </div>
  );
}
```

Add a `.search-hit` rule to `src/app/globals.css` (find the components layer; keep tokens consistent):

```css
.search-hit { font-size: 0.84rem; color: inherit; text-decoration: none; padding: 4px 6px; border-radius: var(--radius-sm); }
.search-hit:hover { background: var(--surface-2, rgba(127,127,127,0.08)); }
```

(If `--surface-2` doesn't exist in globals.css, use an existing hover token from the file — read it first.)

- [ ] **Step 5: MediaGalleries** — create `src/components/media-galleries.tsx` (server component; WhatsApp-files-style grid; pagination via `?media=&mpage=`):

```tsx
import Link from "next/link";
import { FileText, Mic } from "@/components/icons";

export type MediaItem = { id: string; url: string; label: string; date: string; kind: "image" | "video" | "pdf" | "audio" | "doc" };

type T = { mediaTitle: string; mediaFotos: string; mediaVideos: string; mediaDocumentos: string; mediaAudio: string; mediaEmpty: string; older: string; newer: string };

const TABS = ["fotos", "videos", "documentos", "audio"] as const;
export type MediaTab = (typeof TABS)[number];
export function isMediaTab(v: string): v is MediaTab {
  return (TABS as readonly string[]).includes(v);
}

export function MediaGalleries({ projectId, tab, items, page, hasMore, t }: {
  projectId: string;
  tab: MediaTab;
  items: MediaItem[];
  page: number;
  hasMore: boolean;
  t: T;
}) {
  const labels: Record<MediaTab, string> = { fotos: t.mediaFotos, videos: t.mediaVideos, documentos: t.mediaDocumentos, audio: t.mediaAudio };
  const href = (mt: MediaTab, p = 1) => `/app/projects/${projectId}?media=${mt}${p > 1 ? `&mpage=${p}` : ""}`;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>{t.mediaTitle}</div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {TABS.map((mt) => (
          <Link key={mt} href={href(mt)} className={`tab ${tab === mt ? "is-on" : ""}`}>{labels[mt]}</Link>
        ))}
      </div>
      {items.length === 0 && <div className="repo-list-empty">{t.mediaEmpty}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {items.map((m) => (
          <a key={`${m.kind}-${m.id}`} href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
            {m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.label} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block" }} />
            ) : m.kind === "video" ? (
              <video src={m.url} preload="metadata" muted style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block", background: "#000" }} />
            ) : (
              <div className="card" style={{ aspectRatio: "1", display: "grid", placeItems: "center", padding: 8 }}>
                {m.kind === "audio" ? <Mic size={22} /> : <FileText size={22} />}
              </div>
            )}
            <div className="mono text-steel" style={{ fontSize: "0.62rem", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.label} · {m.date}
            </div>
          </a>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {page > 1 && <Link href={href(tab, page - 1)} className="btn btn-ghost" style={{ fontSize: "0.76rem" }}>{t.newer}</Link>}
        {hasMore && <Link href={href(tab, page + 1)} className="btn btn-ghost" style={{ fontSize: "0.76rem" }}>{t.older}</Link>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Rewire the page.** In `src/app/app/projects/[id]/page.tsx` (READ the whole file first; this is surgery, not paste):

(a) `searchParams` type gains `media?: string; mpage?: string;`.

(b) Derive the layout mode near `activeTab`:

```ts
  const blockParam = String(block ?? "");
  const inBloqueView = activeTab === "code" && Boolean(blockParam);
```

(c) In the "code" tab render branch: when `inBloqueView` is FALSE render the overview — `BloqueCards` + the obra search form + (when `?q` present) `ProjectSearchResultsPanel` + `MediaGalleries`; when TRUE render the existing workspace (`ProjectFileTree`/`PartidaSummary`/`BloqueSpacesPanel`/`PartidaRecycle`) prefixed with a back link:

```tsx
          <Link href={`/app/projects/${project.id}`} className="kicker" style={{ textDecoration: "none", display: "inline-block", margin: "12px 0 0" }}>
            ← {P.backToBloques}
          </Link>
```

The obra search form (overview only — plain GET form, mirrors the tree-filter pattern):

```tsx
          <form action={`/app/projects/${project.id}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input name="q" defaultValue={partidaFilters.q} placeholder={P.searchObra} className="search-input" style={{ flex: 1 }} />
            <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.78rem" }}>{P.filter}</SubmitButton>
          </form>
          {partidaFilters.q && searchResults && (
            <ProjectSearchResultsPanel projectId={project.id} results={searchResults} t={{ searchResults: P.searchResults, searchNoResults: P.searchNoResults, searchInPartidas: P.searchInPartidas, searchInRegistros: P.searchInRegistros, searchInDocumentos: P.searchInDocumentos, searchInCambios: P.searchInCambios }} />
          )}
```

(d) Overview data (compute only when NOT inBloqueView and activeTab === "code"):

```ts
  const searchResults = !inBloqueView && activeTab === "code" && partidaFilters.q
    ? await searchProject(sessionUser, id, partidaFilters.q)
    : null;

  // Deletable = empty by the same rule the action enforces.
  const segmentIdsAll = project.segments.map((s) => s.id);
  const [partidaCounts, docCounts, crCounts] = !inBloqueView && activeTab === "code" && segmentIdsAll.length
    ? await Promise.all([
        prisma.partida.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
        prisma.document.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
        prisma.changeRequestSegment.groupBy({ by: ["segmentId"], where: { segmentId: { in: segmentIdsAll } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const nonEmpty = new Set<string>([
    ...partidaCounts.map((c) => c.segmentId as string),
    ...docCounts.map((c) => c.segmentId as string),
    ...crCounts.map((c) => c.segmentId as string),
  ].filter(Boolean));
  const bloqueCards = segmentSummaries.map((s) => ({ ...s, deletable: !nonEmpty.has(s.id) }));
```

NOTE: `partida.groupBy` on `segmentId` counts ALL partidas (incl. soft-deleted) — matching the delete action. `segmentSummaries` already carries id/name/progress/count.

(e) Media gallery data:

```ts
  const MEDIA_PAGE = 24;
  const mediaTab = isMediaTab(String(media ?? "")) ? (String(media) as MediaTab) : "fotos";
  const mediaPage = Math.max(1, Number(mpage ?? "1") || 1);
  const mediaType = ({ fotos: "IMAGE", videos: "VIDEO", documentos: "PDF", audio: "AUDIO" } as const)[mediaTab];
  let mediaItems: MediaItem[] = [];
  let mediaHasMore = false;
  if (!inBloqueView && activeTab === "code") {
    const atts = await prisma.attachment.findMany({
      where: { fileType: mediaType, registro: { partida: { projectId: id, deletedAt: null } } },
      orderBy: { id: "desc" },
      skip: (mediaPage - 1) * MEDIA_PAGE,
      take: MEDIA_PAGE + 1,
      select: { id: true, url: true, registro: { select: { serverCreatedAt: true, partida: { select: { name: true } } } } },
    });
    mediaHasMore = atts.length > MEDIA_PAGE;
    mediaItems = atts.slice(0, MEDIA_PAGE).map((a) => ({
      id: a.id, url: a.url,
      label: a.registro.partida.name,
      date: formatTimestamp(a.registro.serverCreatedAt, lang).slice(0, 10),
      kind: mediaTab === "fotos" ? "image" : mediaTab === "videos" ? "video" : mediaTab === "audio" ? "audio" : "pdf",
    }));
    if (mediaTab === "documentos" && mediaPage === 1) {
      // Uploaded documents (planos, minutas, etc.) join the PDF attachments on page 1.
      const docs = await prisma.document.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: MEDIA_PAGE,
        select: { id: true, url: true, title: true, kind: true, createdAt: true },
      });
      mediaItems = [
        ...docs.map((d) => ({ id: d.id, url: d.url, label: d.title ?? d.kind, date: formatTimestamp(d.createdAt, lang).slice(0, 10), kind: "doc" as const })),
        ...mediaItems,
      ].slice(0, MEDIA_PAGE * 2);
    }
  }
```

(f) Render `MediaGalleries` after the search panel in the overview branch:

```tsx
          <MediaGalleries projectId={project.id} tab={mediaTab} items={mediaItems} page={mediaPage} hasMore={mediaHasMore}
            t={{ mediaTitle: P.mediaTitle, mediaFotos: P.mediaFotos, mediaVideos: P.mediaVideos, mediaDocumentos: P.mediaDocumentos, mediaAudio: P.mediaAudio, mediaEmpty: P.mediaEmpty, older: t.pager.older, newer: t.pager.newer }} />
```

(g) Imports: `BloqueCards`, `ProjectSearchResultsPanel`, `MediaGalleries`/`isMediaTab`/`MediaTab`/`MediaItem`, `searchProject`. The `BloqueCards` call:

```tsx
          <BloqueCards projectId={project.id} bloques={bloqueCards} ungroupedCount={project.partidas.length} canEdit={canEditStructure} isOwner={isOwner}
            t={{ bloquesTitle: P.bloquesTitle, bloqueCard: P.bloqueCard, openBloque: P.openBloque, ungrouped: P.ungrouped, newSegment: P.newSegment, addSegment: P.addSegment, deleteBloque: P.deleteBloque, deleteBloqueConfirm: P.deleteBloqueConfirm, yes: P.yes, no: P.no }} />
```

NOTE on data volume: in the overview branch the spaces-panel and recycle queries (spaceDocs/spaceNotes/spaceMedia/reminders/deletedPartidas) should be skipped — gate their existing `activeTab === "code"` conditions with `&& inBloqueView` so the overview stays light.

- [ ] **Step 7: Gate + commit**

```bash
npm test && npm run lint && npm run build
git add -A && git commit -m "feat(r3): project page reshape — bloque cards overview, obra search, media galleries; workspace one click deeper (R3.1, R3.2)"
```

---

### Task 5: Facet panel UI in the bloque view (R3.5 wiring)

**Files:**
- Modify: `src/components/project-file-tree.tsx` (the `tree-filter` form, lines ~94-110)
- Modify: `src/app/app/projects/[id]/page.tsx` (parse facet searchParams, enrich partidas, pass counts)
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 1: Dictionary.** ES `project` block adds:

```ts
      facetTags: "Etiquetas",
      facetProgress: "Avance",
      facetProgressMin: "mín %",
      facetProgressMax: "máx %",
      facetOpenCambios: "Con cambios abiertos",
      facetCreated: "Creada entre",
```

EN: `facetTags: "Tags",  facetProgress: "Progress", facetProgressMin: "min %", facetProgressMax: "max %", facetOpenCambios: "With open changes", facetCreated: "Created between",`

- [ ] **Step 2: Page data.** In `projects/[id]/page.tsx`:

(a) `searchParams` gains `tags?: string | string[]; pmin?: string; pmax?: string; cambios?: string; ffrom?: string; fto?: string;`

(b) Build the open-cambios partida set and tag names (only when `inBloqueView`):

```ts
  const openCRs = inBloqueView
    ? await prisma.changeRequest.findMany({
        where: { projectId: id, status: "OPEN" },
        select: { partidas: { select: { partidaId: true } }, segments: { select: { segmentId: true } } },
      })
    : [];
  const openPartidaIds = new Set(openCRs.flatMap((c) => c.partidas.map((p) => p.partidaId)));
  const openSegmentIds = new Set(openCRs.flatMap((c) => c.segments.map((sg) => sg.segmentId)));
```

(c) Enrich the partida objects fed to `filterPartidaGroups` — where `project.segments`/`project.partidas` are mapped today, attach the facet fields (partidas already include `tags: { include: { tag: ... } }`, `progressPct`, `createdAt` — verify the include selects them; add to the include if missing):

```ts
  const enrich = <T extends { id: string; segmentId?: string | null; progressPct: number; createdAt: Date; tags: { tag: { name: string } }[] }>(p: T) => ({
    ...p,
    tagNames: p.tags.map((tp) => tp.tag.name),
    hasOpenCambios: openPartidaIds.has(p.id) || (p.segmentId ? openSegmentIds.has(p.segmentId) : false),
  });
```

apply `enrich` to every partida in the segments map and the ungrouped array BEFORE calling `filterPartidaGroups`, and extend `partidaFilters`:

```ts
  const tagsParam = ([] as string[]).concat(tags ?? []).filter(Boolean);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const dateOrNull = (v: unknown) => { const d = new Date(String(v ?? "")); return v && !Number.isNaN(d.getTime()) ? d : null; };
  const partidaFilters = {
    q: String(q ?? "").trim(),
    block: blockParam,
    tags: tagsParam,
    progressMin: pmin != null && pmin !== "" ? num(pmin) : null,
    progressMax: pmax != null && pmax !== "" ? num(pmax) : null,
    openCambios: cambios === "open",
    createdFrom: dateOrNull(ffrom),
    createdTo: dateOrNull(fto),
  };
```

and pass the new fields into `filterPartidaGroups(...)` plus compute tag facet counts for the panel:

```ts
  const tagCounts = new Map<string, number>();
  for (const p of [...project.segments.flatMap((s) => s.partidas), ...project.partidas]) {
    for (const tp of p.tags) tagCounts.set(tp.tag.name, (tagCounts.get(tp.tag.name) ?? 0) + 1);
  }
```

Pass `facets={{ tagCounts: [...tagCounts.entries()], selected: partidaFilters }}` into `ProjectFileTree` (extend its props).

- [ ] **Step 3: Facet panel.** In `project-file-tree.tsx`, extend the GET form (it already posts `q` + `block`): add hidden `block` is already a select; append the facet controls inside the same `<form>` (Amazon-style checkbox list):

```tsx
        <details className="facet-panel" open={facets.hasActive}>
          <summary className="form-label" style={{ cursor: "pointer" }}>{t.filter}</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {facets.tagCounts.length > 0 && (
              <div>
                <div className="form-label">{t.facetTags}</div>
                {facets.tagCounts.map(([name, count]) => (
                  <label key={name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem" }}>
                    <input type="checkbox" name="tags" value={name} defaultChecked={facets.selected.tags.includes(name)} />
                    {name} <span className="mono text-steel" style={{ fontSize: "0.66rem" }}>({count})</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="form-label" style={{ margin: 0 }}>{t.facetProgress}</span>
              <input name="pmin" type="number" min={0} max={100} defaultValue={facets.selected.progressMin ?? ""} placeholder={t.facetProgressMin} className="input" style={{ width: 80 }} />
              <input name="pmax" type="number" min={0} max={100} defaultValue={facets.selected.progressMax ?? ""} placeholder={t.facetProgressMax} className="input" style={{ width: 80 }} />
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem" }}>
              <input type="checkbox" name="cambios" value="open" defaultChecked={facets.selected.openCambios} />
              {t.facetOpenCambios}
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="form-label" style={{ margin: 0 }}>{t.facetCreated}</span>
              <input name="ffrom" type="date" className="input" style={{ width: 140 }} />
              <input name="fto" type="date" className="input" style={{ width: 140 }} />
            </div>
          </div>
        </details>
```

Extend `FilterState` and the `t` prop type accordingly (add the six facet labels; `facets` prop = `{ tagCounts: [string, number][]; selected: { tags: string[]; progressMin: number|null; progressMax: number|null; openCambios: boolean }; hasActive: boolean }` — compute `hasActive` in the page from `hasFilters` minus query/block). Partida links built via `projectHref` keep `q`/`block` only — facet params reset on navigation, which is acceptable v1 (note it).

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run lint && npm run build
git add -A && git commit -m "feat(r3): Amazon-style facet panel — tags, progress, open cambios, dates (R3.5)"
```

---

### Task 6: Dashboard rework (R3.4)

**Files:**
- Modify: `src/app/app/page.tsx` (remove the `dash-analytics` section lines ~113-197; add chart-buttons + table view)
- Modify: `src/i18n/dictionaries.ts`
- Check-then-delete: `src/lib/dashboard/analytics.ts` + any test referencing `buildDashboardAnalytics`

- [ ] **Step 1: Dictionary.** ES `dash` block adds:

```ts
      tableTitleActive: "Tabla general · activas",
      tableTitleArchived: "Tabla general · archivadas",
      colName: "Obra",
      colCode: "Código",
      colProgress: "Avance",
      colResident: "Residente",
      colDate: "Creada",
      backToDash: "Volver al tablero",
      openTable: "Ver tabla",
```

EN: `tableTitleActive: "Overview table · active", tableTitleArchived: "Overview table · archived", colName: "Site", colCode: "Code", colProgress: "Progress", colResident: "Resident", colDate: "Created", backToDash: "Back to dashboard", openTable: "Open table",`

- [ ] **Step 2: Page rework.** In `src/app/app/page.tsx`:

(a) Accept searchParams: `export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; sort?: string; dir?: string }> })` and `const { view, sort, dir } = await searchParams;`

(b) Build table rows when `view` is `"activas"` or (ADMIN/MANAGER) `"archivadas"`:

```ts
  const tableView = view === "activas" ? "activas" : view === "archivadas" && isAdmin ? "archivadas" : null;
  let tableRows: { id: string; name: string; code: string; progress: number; resident: string; createdAt: Date }[] = [];
  if (tableView) {
    const rows = await prisma.project.findMany({
      where: tableView === "activas"
        ? { ...projectAccessWhere(u), archivedAt: null }
        : { companyId: u.companyId, archivedAt: { not: null } },
      include: {
        partidas: { where: { deletedAt: null }, select: { progressPct: true } },
        assignments: { where: { role: "RESIDENT" }, take: 1, include: { user: { select: { name: true } } } },
      },
    });
    tableRows = rows.map((p) => ({
      id: p.id, name: p.name, code: p.registrationCode,
      progress: projectProgress(p.partidas.map((x) => ({ ...x, registros: [] }))),
      resident: p.assignments[0]?.user.name ?? "—",
      createdAt: p.createdAt,
    }));
    const key = (["name", "code", "progress", "resident", "date"].includes(String(sort)) ? String(sort) : "name") as "name" | "code" | "progress" | "resident" | "date";
    const mul = dir === "desc" ? -1 : 1;
    tableRows.sort((a, b) => {
      if (key === "progress") return (a.progress - b.progress) * mul;
      if (key === "date") return (a.createdAt.getTime() - b.createdAt.getTime()) * mul;
      const av = key === "name" ? a.name : key === "code" ? a.code : a.resident;
      const bv = key === "name" ? b.name : key === "code" ? b.code : b.resident;
      return av.localeCompare(bv) * mul;
    });
  }
```

(NOTE: check `projectProgress`'s exact input type before the `.map` shim — read `src/lib/project/progress.ts` and call it the way the page already does at line 59.)

(c) Replace the WHOLE `dash-analytics` section (the `analitica-cards`, `dash-analytics-panel` health list, and `dash-risk-panel` — lines ~113-197) with the dual chart-buttons:

```tsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "18px 0" }}>
        <Link href="/app?view=activas" className="card" style={{ padding: 18, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="kicker">{D.tabActive}</div>
            <strong style={{ fontSize: "2rem" }}>{projectRows.length}</strong>
          </div>
          <span className="mono text-steel" style={{ fontSize: "0.7rem" }}>{D.openTable} →</span>
        </Link>
        {isAdmin ? (
          <Link href="/app?view=archivadas" className="card" style={{ padding: 18, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="kicker">{D.tabArchived}</div>
              <strong style={{ fontSize: "2rem" }}>{archived.length}</strong>
            </div>
            <span className="mono text-steel" style={{ fontSize: "0.7rem" }}>{D.openTable} →</span>
          </Link>
        ) : <div />}
      </div>
```

(d) When `tableView` is set, render the table INSTEAD of the dual-column layout (early-ish branch), with sortable headers and a back link:

```tsx
  if (tableView) {
    const th = (label: string, key: string) => {
      const nextDir = sort === key && dir !== "desc" ? "desc" : "asc";
      return (
        <th style={{ textAlign: "left", padding: "8px 10px" }}>
          <Link href={`/app?view=${tableView}&sort=${key}&dir=${nextDir}`} style={{ textDecoration: "none", color: "inherit" }}>
            {label}{sort === key ? (dir === "desc" ? " ↓" : " ↑") : ""}
          </Link>
        </th>
      );
    };
    return (
      <div className="reveal">
        <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {D.backToDash}</Link>
        <h1 className="h-lg" style={{ margin: "10px 0 16px" }}>{tableView === "activas" ? D.tableTitleActive : D.tableTitleArchived}</h1>
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead><tr className="mono" style={{ fontSize: "0.7rem", borderBottom: "1px solid var(--line-strong)" }}>
              {th(D.colName, "name")}{th(D.colCode, "code")}{th(D.colProgress, "progress")}{th(D.colResident, "resident")}{th(D.colDate, "date")}
            </tr></thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line, #8884)" }}>
                  <td style={{ padding: "8px 10px" }}><Link href={`/app/projects/${r.id}`} style={{ color: "inherit" }}>{r.name}</Link></td>
                  <td className="mono" style={{ padding: "8px 10px", fontSize: "0.74rem" }}>{r.code}</td>
                  <td style={{ padding: "8px 10px" }}>{r.progress}%</td>
                  <td style={{ padding: "8px 10px" }}>{r.resident}</td>
                  <td className="mono" style={{ padding: "8px 10px", fontSize: "0.74rem" }}>{formatTimestamp(r.createdAt, lang as Lang).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
```

Use the `↑`/`↓` arrows as plain characters (they are ASCII-adjacent typographic arrows already used nowhere else — if the no-emoji linting/test flags them, swap to `asc`/`desc` text suffixes).

(e) Remove the `buildDashboardAnalytics` import and call. Then: `grep -rn "buildDashboardAnalytics\|dashboard/analytics" web/src web/tests` — if the lib is now referenced ONLY by its own test, delete `src/lib/dashboard/analytics.ts` and its test file; if anything else uses it, leave the lib and only remove this page's usage. Keep the `counter` line in the header (it shows both counts). Dictionary keys `analyticsProgress`/`analyticsPartidas`/`analyticsOpenChanges`/`analyticsOverdue`/`analyticsHealth`/`analyticsRisk`/`analyticsNoRisk` become dashboard-unused but `analyticsGreen/Yellow/Red` are also used by per-project Analítica — verify with grep before deleting ANY dict key; when in doubt keep them (dead keys are harmless, missing keys break builds).

- [ ] **Step 3: Parity check (spec requirement).** Per-project Analítica must still expose: general health, by-bloque progress, open cambios, overdue reminders. Verify by reading `src/components/analitica-tab.tsx` — all four exist (general/byBloque/openChanges/overdue). State this in the commit message.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run lint && npm run build
git add -A && git commit -m "feat(r3): dashboard rework — dual chart-buttons + sortable general table; portfolio analytics retired (parity lives in per-obra Analitica) (R3.4)"
```

---

### Task 7: Final gate + push

- [ ] **Step 1:** `npm test && npm run lint && npm run build` — all green (~296+ tests).

- [ ] **Step 2: Acceptance sweep** (manual, `npm run dev`):
- Project page (no block): bloque cards with progress + create card + delete (only on empty bloques, double-confirm, lands a notification); "Sin bloque" card when ungrouped partidas exist.
- Click a bloque → full workspace (tree/composer/spaces/recycle) scoped to it; back link returns.
- Obra search box: "plomería"-style query → grouped results linking to partida/cambio/document.
- Media galleries: fotos grid with thumbs; videos/documentos/audio tabs; pagination on >24 items.
- Bloque view facets: tag checkboxes with counts, progress min/max, open-cambios, date range — combine and filter.
- Dashboard: analytics panel gone; two big buttons; tables sort by each column; archivadas table only for ADMIN/MANAGER.

- [ ] **Step 3:** `git push`

---

## Self-review (done at planning time)

- **Spec coverage:** R3.1→T4 (cards + galleries + one-click-deeper workspace) · R3.2→T1+T4 · R3.3→T2+T4 (button) · R3.4→T6 · R3.5→T3+T5.
- **Type consistency:** `searchProject`/`ProjectSearchResults` (T1) ↔ panel component (T4); `deleteSegment` (T2) ↔ `DeleteSegmentButton` (T4); `PartidaFilterInput` facet fields (T3) ↔ page param parsing + `FilterState`/`facets` prop (T5); `MediaTab`/`isMediaTab`/`MediaItem` defined once in the component (T4) and imported by the page.
- **Judgment calls:** one route, two layouts via `?block` (avoids a parallel bloque route and keeps every approved surface intact); facet params reset on partida navigation (v1, noted); documentos gallery merges Document rows only on page 1 (v1 simplicity, noted); empty-check for bloque delete duplicated page-side only to hide the button — the action re-enforces it authoritatively.
- **Ripple watch:** removing `buildDashboardAnalytics` may orphan its lib/test (T6 Step 2e has the grep-then-delete rule); dictionary `analytics*` keys must be grep-verified before any deletion.
