# Phase 1a — Bloque rename + Partidas/Planos split + Planos upload

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the IA match the architect's mental model — rename Segmento→Bloque, give Partidas (work items) their own tab, and turn Planos into a real surface that holds uploaded plan files listed by date.

**Architecture:** A new additive `Document` model (project-scoped, `kind` enum, reusing the Phase 0 multimodal upload pipeline) backs a Planos tab; the existing work-item tree tab is relabeled "Partidas". Vocabulary (Bloque) is a dictionary-only change since the file tree reads its labels from i18n. The DB model stays `Segment` internally; only UI strings change.

**Tech Stack:** Next.js 15 (App Router, RSC + server actions, `useActionState`), Prisma 6 + Postgres (Neon), Vitest, TypeScript.

Source: `docs/superpowers/specs/2026-06-05-raphl-architect-feedback-analysis.md` (§3, §4.1, §4.2, §14). Run all commands from `web/`. Branch `feat/web-m1-core-loop`; do NOT push.

Scope note: per-Bloque plan spaces, Planos Actualizados, Levantamientos/Ideas, and the in-app PDF/large-image viewer are **P4** — out of scope here. Resident upload permission is part of the **P2** roles overhaul; this slice gates `createDocument` to ADMIN/MANAGER like the other create actions, to be widened in P2.

---

## File Structure

- `web/prisma/schema.prisma` + migration — `Document` model + `DocumentKind` enum. (Task 1)
- `web/src/i18n/dictionaries.ts` — Bloque rename; `tabPartidas`/`tabPlanos`; `planos.*` strings. (Task 2)
- `web/src/app/actions/documents.ts` — `createDocument` (structured result). (Task 3)
- `web/tests/documents-action.test.ts` — create action tests. (Task 3)
- `web/src/app/api/media/[key]/route.ts` + `web/tests/media-route-auth.test.ts` — authorize `Document` media. (Task 4)
- `web/src/components/planos-upload.tsx` (client) + `web/src/components/planos-tab.tsx` (RSC). (Task 5)
- `web/src/app/app/projects/[id]/page.tsx` — relabel tabs, add Planos tab + branch. (Task 6)

---

### Task 1: Document model + migration

**Files:**
- Modify: `web/prisma/schema.prisma`

- [ ] **Step 1: Add the enum + model.** Append to `schema.prisma`:

```prisma
enum DocumentKind {
  PLANO
  DOCUMENTO
  LEVANTAMIENTO
  IDEA
  MINUTA
  PLANO_ACTUALIZADO
}

model Document {
  id           String       @id @default(cuid())
  projectId    String
  project      Project      @relation(fields: [projectId], references: [id])
  segmentId    String?      // per-Bloque plan spaces are P4; null = project-level
  kind         DocumentKind @default(PLANO)
  title        String?
  url          String
  sha256       String
  fileType     AttachmentType
  uploadedById String
  createdAt    DateTime     @default(now())

  @@index([projectId, kind, createdAt])
}
```

(Only `PLANO` is wired this slice; the other kinds are pre-declared so P4 needs no enum migration.)

- [ ] **Step 2: Add the back-relation.** In `model Project { ... }` add:
```prisma
  documents      Document[]
```

- [ ] **Step 3: Migrate + regenerate.** Run: `npx prisma migrate dev --name documents_planos`
Expected: a new additive migration (CREATE TYPE + CREATE TABLE + ADD COLUMN nullable + index + FK), "in sync", client regenerated. If it reports drift/reset, STOP and report BLOCKED (do not reset).

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit` — Expected: exit 0.

- [ ] **Step 5: Commit**
```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat(db): Document model (Planos) + DocumentKind enum"
```

---

### Task 2: i18n — Bloque rename + tabs + Planos strings

**Files:**
- Modify: `web/src/i18n/dictionaries.ts`

- [ ] **Step 1: Rename Bloque + tab keys + add planos block (ES).** In the ES `project` object, make these exact value changes and key changes:
  - `tabCode: "Planos",` → `tabPartidas: "Partidas",`
  - add right after it: `tabPlanos: "Planos",`
  - `ungrouped: "Sin segmento",` → `ungrouped: "Sin bloque",`
  - `segmentPlaceholder: "Segmento (opcional)",` → `segmentPlaceholder: "Bloque (opcional)",`
  - `newSegment: "Nombre del segmento",` → `newSegment: "Nombre del bloque",`
  - `addSegment: "+ Segmento",` → `addSegment: "+ Bloque",`

  Then add a new `planos` block in the ES root (after the `changes` block):
```typescript
    planos: {
      empty: "Aún no hay planos. Sube el primero.",
      upload: "Subir plano",
      title: "Nombre del plano (opcional)",
      uploadedBy: "subido por",
      view: "Ver plano",
      error: "No se pudo subir. Inténtalo de nuevo.",
    },
```

- [ ] **Step 2: Mirror in EN.** In the EN `project` object:
  - `tabCode: "Blueprints",` → `tabPartidas: "Work items",`
  - add: `tabPlanos: "Blueprints",`
  - `ungrouped: "No segment",` → `ungrouped: "No block",`
  - `segmentPlaceholder: "Segment (optional)",` → `segmentPlaceholder: "Block (optional)",`
  - `newSegment: "Segment name",` → `newSegment: "Block name",`
  - `addSegment: "+ Segment",` → `addSegment: "+ Block",`

  And the EN `planos` block (after EN `changes`):
```typescript
    planos: {
      empty: "No blueprints yet. Upload the first.",
      upload: "Upload blueprint",
      title: "Blueprint name (optional)",
      uploadedBy: "uploaded by",
      view: "View blueprint",
      error: "Upload failed. Please try again.",
    },
```

- [ ] **Step 3: Typecheck (ES/EN shapes must match).** Run: `npx tsc --noEmit`
Expected: errors at `projects/[id]/page.tsx` referencing `P.tabCode` (renamed) — that's fixed in Task 6. To verify THIS task in isolation, instead grep that both locales changed:
Run: `rg -n "tabPartidas|tabPlanos|Sin bloque|No block|planos:" web/src/i18n/dictionaries.ts`
Expected: matches in both ES and EN. (Full tsc goes green after Task 6.)

- [ ] **Step 4: Commit**
```bash
git add web/src/i18n/dictionaries.ts
git commit -m "i18n: Segmento to Bloque; Partidas/Planos tab labels; planos strings"
```

---

### Task 3: createDocument server action

**Files:**
- Create: `web/src/app/actions/documents.ts`
- Test: `web/tests/documents-action.test.ts`

- [ ] **Step 1: Write the failing test** (`web/tests/documents-action.test.ts`):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const storagePut = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({ storage: { put: storagePut, get: vi.fn() } }));

import { createDocument } from "@/app/actions/documents";

let companyId = "", adminId = "", residentId = "", projectId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `Doc Co ${s}` } });
  companyId = company.id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Doc Project ${s}` } })).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset(); revalidatePathMock.mockReset(); storagePut.mockReset();
  storagePut.mockResolvedValue({ key: "plano.pdf", url: "/api/media/plano.pdf" });
});

function fdWithFile() {
  const fd = new FormData();
  fd.set("projectId", projectId);
  fd.set("title", "Planta arquitectónica");
  fd.append("file", new File([new Uint8Array(5)], "plano.pdf", { type: "application/pdf" }));
  return fd;
}

describe("createDocument", () => {
  it("stores a PLANO document for an admin", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(true);
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, title: "Planta arquitectónica" } });
    expect(doc.kind).toBe("PLANO");
    expect(doc.fileType).toBe("PDF");
    expect(doc.url).toBe("/api/media/plano.pdf");
  });
  it("rejects a resident (role gate, P2 widens this)", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    const res = await createDocument(null, fdWithFile());
    expect(res.ok).toBe(false);
  });
  it("rejects when no file is provided", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData(); fd.set("projectId", projectId);
    const res = await createDocument(null, fd);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it (fails)** — Run: `npm test -- documents-action` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `web/src/app/actions/documents.ts`:**

```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";

export type DocResult = { ok: true } | { ok: false; error: string };

export async function createDocument(_prev: DocResult | null, formData: FormData): Promise<DocResult> {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
    if (!user?.id || !user.companyId || !user.role) return { ok: false, error: "No autorizado." };
    // Role gate (P2 widens to the project's resident/supervisor).
    if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) return { ok: false, error: "No autorizado." };

    const projectId = String(formData.get("projectId"));
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } });
    if (!project) return { ok: false, error: "No autorizado." };

    const title = (String(formData.get("title") ?? "").trim()) || null;
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    const prepared = await prepareAttachments(files, storage);
    if (prepared.length === 0) return { ok: false, error: "Selecciona un archivo." };

    await prisma.document.createMany({
      data: prepared.map((a) => ({
        projectId, kind: "PLANO" as const, title,
        url: a.url, sha256: a.sha256, fileType: a.fileType, uploadedById: user.id!,
      })),
    });
    revalidatePath(`/app/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}
```

- [ ] **Step 4: Run it (passes)** — Run: `npm test -- documents-action` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add web/src/app/actions/documents.ts web/tests/documents-action.test.ts
git commit -m "feat(planos): createDocument action (PLANO upload, structured result)"
```

---

### Task 4: Authorize Document media in the media route

**Files:**
- Modify: `web/src/app/api/media/[key]/route.ts`
- Modify: `web/tests/media-route-auth.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe("GET /api/media/[key]", ...)` block of `media-route-auth.test.ts`:

```typescript
  it("serves a project's plan document to a same-company user", async () => {
    const doc = await prisma.document.create({
      data: { projectId: projectAId, kind: "PLANO", url: "/api/media/plano-x.pdf", sha256: "d".repeat(64), fileType: "PDF", uploadedById: userAId },
    });
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId } });
    const res = await GET(new Request("http://test.local/api/media/plano-x.pdf"), { params: Promise.resolve({ key: "plano-x.pdf" }) });
    expect(res.status).toBe(200);
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });
  it("does not serve another company's plan document", async () => {
    const doc = await prisma.document.create({
      data: { projectId: projectAId, kind: "PLANO", url: "/api/media/plano-y.pdf", sha256: "e".repeat(64), fileType: "PDF", uploadedById: userAId },
    });
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId } });
    const res = await GET(new Request("http://test.local/api/media/plano-y.pdf"), { params: Promise.resolve({ key: "plano-y.pdf" }) });
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
    await prisma.document.deleteMany({ where: { id: doc.id } });
  });
```

(Reuses existing fixtures `projectAId`, `userAId`, `userBId`, `companyAId`, `companyBId`, `storageGet`, `authMock`. Note `contentTypeForKey` already supports `.pdf` from Phase 0.)

- [ ] **Step 2: Run it (fails)** — Run: `npm test -- media-route-auth` — Expected: FAIL (Document media 404s).

- [ ] **Step 3: Extend the route's `owned` lookup** in `web/src/app/api/media/[key]/route.ts` to add a third branch:

```typescript
  const owned =
    (await prisma.attachment.findFirst({
      where: { url, registro: { partida: { project: { companyId: user.companyId } } } },
      select: { id: true },
    })) ??
    (await prisma.changeAttachment.findFirst({
      where: { url, changeRequest: { project: { companyId: user.companyId } } },
      select: { id: true },
    })) ??
    (await prisma.document.findFirst({
      where: { url, project: { companyId: user.companyId } },
      select: { id: true },
    }));
  if (!owned) return new Response("Not found", { status: 404 });
```

- [ ] **Step 4: Run it (passes)** — Run: `npm test -- media-route-auth` — Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**
```bash
git add "web/src/app/api/media/[key]/route.ts" web/tests/media-route-auth.test.ts
git commit -m "fix(security): authorize Document (plan) media by company"
```

---

### Task 5: Planos UI (upload form + dated list)

**Files:**
- Create: `web/src/components/planos-upload.tsx`
- Create: `web/src/components/planos-tab.tsx`

- [ ] **Step 1: Create the client upload form** `web/src/components/planos-upload.tsx`:

```tsx
"use client";
import { useEffect, useRef, useActionState } from "react";
import { createDocument } from "@/app/actions/documents";
import { SubmitButton } from "@/components/submit-button";

type T = { upload: string; title: string; error: string };

export function PlanosUpload({ projectId, t }: { projectId: string; t: T }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(createDocument, null);

  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);

  return (
    <form ref={formRef} action={formAction} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" placeholder={t.title} className="input" style={{ marginBottom: 10 }} />
      {state && !state.ok && (
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {state.error || t.error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" style={{ fontSize: "0.8rem" }} />
        <SubmitButton className="btn btn-accent" style={{ marginLeft: "auto" }}>{t.upload}</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the list RSC** `web/src/components/planos-tab.tsx`:

```tsx
import type { Document } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { PlanosUpload } from "@/components/planos-upload";

type PlanosT = {
  empty: string; upload: string; title: string; error: string; uploadedBy: string; view: string;
};

export function PlanosTab({
  projectId, docs, authorMap, lang, isAdmin, t,
}: {
  projectId: string;
  docs: (Document & { uploaderName?: string | null })[];
  authorMap: Map<string, string>;
  lang: Lang;
  isAdmin: boolean;
  t: PlanosT;
}) {
  return (
    <div>
      {isAdmin && <PlanosUpload projectId={projectId} t={{ upload: t.upload, title: t.title, error: t.error }} />}
      <div className="repo-list">
        {docs.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {docs.map((d) => (
          <div key={d.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title">{d.title || d.url.split("/").pop()}</span>
              <span className="cr-meta">{t.uploadedBy} {authorMap.get(d.uploadedById) ?? "—"} · {formatTimestamp(d.createdAt, lang)}</span>
            </span>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", whiteSpace: "nowrap" }}>
              {t.view}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` — Expected: errors only in `projects/[id]/page.tsx` (still referencing `P.tabCode`); the two new components themselves compile. (Fixed in Task 6.)

- [ ] **Step 4: Commit**
```bash
git add web/src/components/planos-upload.tsx web/src/components/planos-tab.tsx
git commit -m "feat(planos): upload form + dated plan list components"
```

---

### Task 6: Wire tabs (Partidas/Planos) into the project page

**Files:**
- Modify: `web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Add the Planos import + Folder icon.** Change the imports block to add:
```tsx
import { PlanosTab } from "@/components/planos-tab";
import { Layers, Branch, BarChart, Sliders, Folder } from "@/components/icons";
```
(Replace the existing `import { Layers, Branch, BarChart, Sliders } from "@/components/icons";` line with the one above that also imports `Folder`.)

- [ ] **Step 2: Extend the tab state + load plans.** Replace the `const activeTab = ...` line and the `changeRows` block with:
```tsx
  const activeTab = tab === "cambios" ? "cambios" : tab === "planos" ? "planos" : "code";

  const changeRows = activeTab === "cambios"
    ? (await prisma.changeRequest.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { partidas: true } } },
      })).map((c) => ({
        id: c.id, code: c.code, title: c.title, status: c.status,
        costImpact: c.costImpact ? c.costImpact.toString() : null,
        daysImpact: c.daysImpact, createdAt: c.createdAt, seal: c.seal,
        partidaCount: c._count.partidas,
      }))
    : [];

  const docs = activeTab === "planos"
    ? await prisma.document.findMany({ where: { projectId: id, kind: "PLANO" }, orderBy: { createdAt: "desc" } })
    : [];
  const uploaderIds = [...new Set(docs.map((d) => d.uploadedById))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds }, companyId }, select: { id: true, name: true } })
    : [];
  const docAuthorMap = new Map(uploaders.map((u) => [u.id, u.name]));
```

- [ ] **Step 3: Replace the tab bar** (the `<div className="tabs">…</div>`) with the relabeled + new Planos tab:
```tsx
      <div className="tabs">
        <Link href={`/app/projects/${id}?tab=code`} className={`tab ${activeTab === "code" ? "is-on" : ""}`} aria-current={activeTab === "code" ? "page" : undefined}><Layers size={13} />{P.tabPartidas}</Link>
        <Link href={`/app/projects/${id}?tab=planos`} className={`tab ${activeTab === "planos" ? "is-on" : ""}`} aria-current={activeTab === "planos" ? "page" : undefined}><Folder size={13} />{P.tabPlanos}</Link>
        <Link href={`/app/projects/${id}?tab=cambios`} className={`tab ${activeTab === "cambios" ? "is-on" : ""}`} aria-current={activeTab === "cambios" ? "page" : undefined}><Branch size={13} />{P.tabChanges}</Link>
        <span className="tab is-off" aria-disabled="true"><BarChart size={13} />{P.tabAnalytics} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off" aria-disabled="true"><Sliders size={13} />{P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>
```

- [ ] **Step 4: Add the Planos branch to the body.** Change the body conditional so it has three arms. Replace `{activeTab === "cambios" ? ( … ) : ( <div className="workspace">…</div> )}` with:
```tsx
      {activeTab === "cambios" ? (
        <div style={{ marginTop: 16 }}>
          <CambiosList
            projectId={project.id}
            rows={changeRows}
            partidas={allPartidas.map((pa) => ({ id: pa.id, name: pa.name }))}
            lang={lang}
            t={{
              empty: t.changes.empty, states: t.changes.states, days: t.changes.days,
              new: t.changes.new, fieldTitle: t.changes.fieldTitle, fieldDescription: t.changes.fieldDescription,
              fieldPartidas: t.changes.fieldPartidas, impactCost: t.changes.impactCost, impactTime: t.changes.impactTime,
              evidence: t.changes.evidence, gps: t.composer.gps, gpsOk: t.composer.gpsOk,
            }}
          />
        </div>
      ) : activeTab === "planos" ? (
        <div style={{ marginTop: 16 }}>
          <PlanosTab
            projectId={project.id}
            docs={docs}
            authorMap={docAuthorMap}
            lang={lang}
            isAdmin={isAdmin}
            t={{ empty: t.planos.empty, upload: t.planos.upload, title: t.planos.title, error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view }}
          />
        </div>
      ) : (
        <div className="workspace">
          <ProjectFileTree
            projectId={project.id}
            segments={project.segments}
            ungrouped={project.partidas}
            segmentNames={segmentNames}
            selectedId={selectedId}
            isAdmin={isAdmin}
            t={{ ungrouped: P.ungrouped, newPartida: P.newPartida, add: P.add, segmentPlaceholder: P.segmentPlaceholder, newSegment: P.newSegment, addSegment: P.addSegment }}
          />
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
        </div>
      )}
```
(Note: the workspace `else` arm keeps the EXISTING ProjectFileTree + PartidaSummary block unchanged.)

- [ ] **Step 5: Typecheck + build** — Run: `npx tsc --noEmit && npm run build` — Expected: exit 0 / build lists routes. (The `P.tabCode` reference is gone; `P.tabPartidas`/`P.tabPlanos`/`t.planos` now resolve.)

- [ ] **Step 6: Commit**
```bash
git add "web/src/app/app/projects/[id]/page.tsx"
git commit -m "feat(planos): Partidas/Planos tabs; render plan upload + list"
```

---

### Task 7: Full verification

**Files:** none.

- [ ] **Step 1:** Run `npm test` — Expected: all green (existing + `documents-action` + extended `media-route-auth`).
- [ ] **Step 2:** Run `npm run lint && npx tsc --noEmit && npm run build` — Expected: clean.
- [ ] **Step 3:** Run `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/` — Expected: no emoji.
- [ ] **Step 4: Manual pass** (dev server; admin login): open a project → the work-item tab now reads **Partidas**; a new **Planos** tab appears → upload a PDF/image as a plan → it lists by date with "subido por <name>" and a **Ver plano** link that opens it. The tree shows **Bloque** wording (Sin bloque / + Bloque). Toggle ES⇄EN. No emoji.

---

## Self-Review Notes

- **Spec coverage:** §3 Bloque rename (Task 2) · Planos-shows-plans + Partidas separate, §4.1 (Tasks 1,3,5,6) · §14 plan upload (Tasks 1,3,5) · media auth for plans (Task 4). Per-Bloque plan spaces / Planos Actualizados / viewer = P4 (out of scope, noted).
- **Type consistency:** `createDocument(_prev, formData): DocResult` (Task 3) consumed by `useActionState` in `PlanosUpload` (Task 5). `Document` model fields (Task 1) used in `PlanosTab` + page query (Tasks 5,6). `DocResult` mirrors Phase 0's `LogResult` pattern. `t.planos.*` keys (Task 2) consumed in Tasks 5/6. Tab key rename `tabCode`→`tabPartidas` + new `tabPlanos` (Task 2) consumed only in Task 6 (no stale `P.tabCode` after Task 6).
- **Deferred (P2/P4):** resident upload permission (P2 roles), per-Bloque planos + viewer + Planos Actualizados/Levantamientos/Ideas (P4).
- **Note:** Task 2's tsc is intentionally red until Task 6 (the page references the renamed key) — execute Tasks in order; the spec reviewer should run tsc after Task 6, not after Task 2.
```
