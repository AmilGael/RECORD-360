# Phase 1b — Delete Partidas + Recycle bin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins/managers delete Partidas (soft) and recover them from a recycle bin that records who deleted them and when, with permanent delete allowed only for empty Partidas (immutable records are never destroyed).

**Architecture:** Add `deletedAt` + `deletedById` to `Partida` (soft delete); exclude deleted Partidas from every active query; a Recycle section in the Partidas tab lists them with restore / delete-forever (forever only when the Partida has zero Registros — the legal "black box" stays intact).

**Tech Stack:** Next.js 15 (App Router, server actions, RSC), Prisma 6 + Postgres (Neon), Vitest, TypeScript.

Source: `docs/superpowers/specs/2026-06-05-raphl-architect-feedback-analysis.md` (§5.1). Locked default D8: hide-only when a Partida has entries; permanent delete admin-only and only when empty. Run from `web/`. Branch `feat/web-m1-core-loop`; commit directly; do NOT push.

Scope note: rename (project/bloque/partida) + move-between-Bloques are **Phase 1c**; the generalized AuditLog is introduced in 1c. This slice uses `deletedAt`/`deletedById` on the Partida for the recycle record (satisfies "que aparezca el registro de que eso se borró y cuándo"). Resident delete permission is **P2**; 1b gates to ADMIN/MANAGER.

---

## File Structure

- `web/prisma/schema.prisma` + migration — `Partida.deletedAt` + `Partida.deletedById`. (Task 1)
- `web/src/i18n/dictionaries.ts` — delete + recycle strings. (Task 2)
- `web/src/app/actions/partida-crud.ts` — `deletePartida` / `restorePartida` / `purgePartida`. (Task 3)
- `web/tests/partida-crud.test.ts` — action tests. (Task 3)
- `web/src/app/app/projects/[id]/page.tsx`, `web/src/app/app/partidas/[id]/page.tsx`, `web/src/app/app/page.tsx` — exclude deleted Partidas. (Task 4)
- `web/src/components/partida-delete-button.tsx` (client) + `web/src/components/partida-recycle.tsx` (RSC) + wiring. (Task 5)

---

### Task 1: Soft-delete columns on Partida

**Files:** Modify `web/prisma/schema.prisma`

- [ ] **Step 1:** In `model Partida { ... }`, add (after the `name` line):
```prisma
  deletedAt      DateTime?
  deletedById    String?
```
- [ ] **Step 2:** Migrate: `npx prisma migrate dev --name partida_soft_delete`
Expected: additive (ADD COLUMN nullable ×2), "in sync", client regenerated. If it wants to reset, STOP / report BLOCKED.
- [ ] **Step 3:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4:** Commit
```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat(db): Partida soft-delete (deletedAt, deletedById)"
```

---

### Task 2: i18n — delete + recycle strings

**Files:** Modify `web/src/i18n/dictionaries.ts`

- [ ] **Step 1:** In the ES `project` object, add these keys (anywhere inside it):
```typescript
      del: "Borrar partida",
      delConfirm: "¿Borrar?",
      yes: "Sí",
      no: "No",
      recycleTitle: "Reciclaje",
      restore: "Restaurar",
      deleteForever: "Borrar definitivamente",
      deletedBy: "borrado por",
      hasRecords: "Contiene registros (no se puede borrar)",
```
- [ ] **Step 2:** In the EN `project` object, add the mirror:
```typescript
      del: "Delete work item",
      delConfirm: "Delete?",
      yes: "Yes",
      no: "No",
      recycleTitle: "Recycle bin",
      restore: "Restore",
      deleteForever: "Delete permanently",
      deletedBy: "deleted by",
      hasRecords: "Has entries (cannot delete)",
```
- [ ] **Step 3:** `npx tsc --noEmit` → exit 0 (ES/EN shapes match).
- [ ] **Step 4:** Commit
```bash
git add web/src/i18n/dictionaries.ts
git commit -m "i18n: partida delete + recycle bin strings"
```

---

### Task 3: deletePartida / restorePartida / purgePartida actions

**Files:** Create `web/src/app/actions/partida-crud.ts`; Test `web/tests/partida-crud.test.ts`

- [ ] **Step 1: Write the failing test** (`web/tests/partida-crud.test.ts`):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { deletePartida, restorePartida, purgePartida } from "@/app/actions/partida-crud";

let companyId = "", adminId = "", managerId = "", projectId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Del Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `a-${s}@x.do`, name: "A", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `m-${s}@x.do`, name: "M", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Del Project ${s}` } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });
function fd(partidaId: string) { const f = new FormData(); f.set("partidaId", partidaId); return f; }
const asAdmin = () => authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
const asManager = () => authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });

describe("partida soft delete", () => {
  it("deletePartida sets deletedAt + deletedById; restore clears them", async () => {
    asManager();
    const p = await prisma.partida.create({ data: { projectId, name: "to delete" } });
    await deletePartida(fd(p.id));
    let after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.deletedAt).not.toBeNull();
    expect(after.deletedById).toBe(managerId);
    await restorePartida(fd(p.id));
    after = await prisma.partida.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.deletedById).toBeNull();
  });

  it("purge refuses when the partida has registros", async () => {
    asAdmin();
    const p = await prisma.partida.create({ data: { projectId, name: "with records" } });
    await appendRegistro({ partidaId: p.id, authorId: adminId, category: null, text: "x", progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] });
    await expect(purgePartida(fd(p.id))).rejects.toThrow(/inalterable|registros/i);
    expect(await prisma.partida.count({ where: { id: p.id } })).toBe(1);
  });

  it("purge hard-deletes an empty partida (admin)", async () => {
    asAdmin();
    const p = await prisma.partida.create({ data: { projectId, name: "empty" } });
    await purgePartida(fd(p.id));
    expect(await prisma.partida.count({ where: { id: p.id } })).toBe(0);
  });

  it("manager cannot purge (admin-only)", async () => {
    asManager();
    const p = await prisma.partida.create({ data: { projectId, name: "empty2" } });
    await expect(purgePartida(fd(p.id))).rejects.toThrow();
    await prisma.partida.delete({ where: { id: p.id } });
  });
});
```

- [ ] **Step 2: Run it (fails)** — `npm test -- partida-crud` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `web/src/app/actions/partida-crud.ts`:**

```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";

async function requireManager() {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");
  return { id: user.id, companyId: user.companyId, role: user.role };
}

async function ownedPartida(partidaId: string, companyId: string) {
  const p = await prisma.partida.findFirst({
    where: { id: partidaId, project: { companyId } },
    select: { id: true, projectId: true },
  });
  if (!p) throw new Error("Forbidden");
  return p;
}

export async function deletePartida(formData: FormData) {
  const { id: uid, companyId } = await requireManager();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  await prisma.partida.update({ where: { id: p.id }, data: { deletedAt: new Date(), deletedById: uid } });
  revalidatePath(`/app/projects/${p.projectId}`);
}

export async function restorePartida(formData: FormData) {
  const { companyId } = await requireManager();
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  await prisma.partida.update({ where: { id: p.id }, data: { deletedAt: null, deletedById: null } });
  revalidatePath(`/app/projects/${p.projectId}`);
}

export async function purgePartida(formData: FormData) {
  const { role, companyId } = await requireManager();
  if (role !== Role.ADMIN) throw new Error("Forbidden");
  const p = await ownedPartida(String(formData.get("partidaId")), companyId);
  const records = await prisma.registro.count({ where: { partidaId: p.id } });
  if (records > 0) throw new Error("No se puede borrar definitivamente: contiene registros inalterables.");
  await prisma.$transaction([
    prisma.changeRequestPartida.deleteMany({ where: { partidaId: p.id } }),
    prisma.partida.delete({ where: { id: p.id } }),
  ]);
  revalidatePath(`/app/projects/${p.projectId}`);
}
```

- [ ] **Step 4: Run it (passes)** — `npm test -- partida-crud` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add web/src/app/actions/partida-crud.ts web/tests/partida-crud.test.ts
git commit -m "feat(recycle): deletePartida/restorePartida/purgePartida actions"
```

---

### Task 4: Exclude deleted Partidas from active queries

**Files:** Modify `web/src/app/app/projects/[id]/page.tsx`, `web/src/app/app/partidas/[id]/page.tsx`, `web/src/app/app/page.tsx`

- [ ] **Step 1: Project page** — in `web/src/app/app/projects/[id]/page.tsx`, the project query: add `where: { deletedAt: null }` to the segments' nested partidas, and `deletedAt: null` to the ungrouped partidas where. Change:
```tsx
      segments: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { partidas: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      },
      partidas: { where: { segmentId: null, deletedAt: null }, orderBy: { createdAt: "asc" } },
```
And the `selected` partida query — add `deletedAt: null`:
```tsx
  const selected = selectedId
    ? await prisma.partida.findFirst({
        where: { id: selectedId, projectId: id, deletedAt: null },
        include: { registros: { orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }], take: 3, include: { attachments: true, location: true } } },
      })
    : null;
```

- [ ] **Step 2: Partida page** — in `web/src/app/app/partidas/[id]/page.tsx`, change the `findFirstOrThrow` where to also require not-deleted (a deleted partida 404s):
```tsx
    where: { id, project: { companyId }, deletedAt: null },
```

- [ ] **Step 3: Dashboard** — in `web/src/app/app/page.tsx`, the project query's partidas include: add `where: { deletedAt: null }` so counts/progress ignore deleted:
```tsx
      partidas: {
        where: { deletedAt: null },
        select: {
          progressPct: true,
          registros: { orderBy: { serverCreatedAt: "desc" }, take: 1, select: { serverCreatedAt: true, authorId: true, hash: true } },
        },
      },
```

- [ ] **Step 4: Typecheck + build** — `npx tsc --noEmit && npm run build` — Expected: exit 0 / success.

- [ ] **Step 5: Commit**
```bash
git add "web/src/app/app/projects/[id]/page.tsx" "web/src/app/app/partidas/[id]/page.tsx" web/src/app/app/page.tsx
git commit -m "fix(recycle): exclude soft-deleted partidas from active views"
```

---

### Task 5: Delete button + Recycle UI

**Files:** Create `web/src/components/partida-delete-button.tsx`, `web/src/components/partida-recycle.tsx`; Modify `web/src/app/app/partidas/[id]/page.tsx`, `web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Delete button** `web/src/components/partida-delete-button.tsx` (client confirm, modeled on ArchiveButton; navigates to the project after delete since the partida page would otherwise 404):

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePartida } from "@/app/actions/partida-crud";
import { SubmitButton } from "@/components/submit-button";

type T = { del: string; delConfirm: string; yes: string; no: string };

export function PartidaDeleteButton({ partidaId, projectId, t }: { partidaId: string; projectId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--steel)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
        {t.del}
      </button>
    );
  }
  return (
    <form
      action={async (fd) => { await deletePartida(fd); router.push(`/app/projects/${projectId}`); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      <span className="mono" style={{ fontSize: "0.72rem", color: "var(--accent-deep)" }}>{t.delConfirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.no}</button>
    </form>
  );
}
```

- [ ] **Step 2: Recycle list** `web/src/components/partida-recycle.tsx` (RSC):

```tsx
import type { Partida } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { restorePartida, purgePartida } from "@/app/actions/partida-crud";
import { SubmitButton } from "@/components/submit-button";

type RecycleT = { recycleTitle: string; restore: string; deleteForever: string; deletedBy: string; hasRecords: string };
type DeletedRow = Partida & { _count: { registros: number } };

export function PartidaRecycle({
  rows, deleterMap, lang, t,
}: {
  rows: DeletedRow[];
  deleterMap: Map<string, string>;
  lang: Lang;
  t: RecycleT;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>{t.recycleTitle}</div>
      <div className="repo-list">
        {rows.map((p) => (
          <div key={p.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title" style={{ color: "var(--steel)" }}>{p.name}</span>
              <span className="cr-meta">{t.deletedBy} {p.deletedById ? (deleterMap.get(p.deletedById) ?? "—") : "—"} · {p.deletedAt ? formatTimestamp(p.deletedAt, lang) : ""}</span>
            </span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <form action={restorePartida}>
                <input type="hidden" name="partidaId" value={p.id} />
                <SubmitButton className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }}>{t.restore}</SubmitButton>
              </form>
              {p._count.registros === 0 ? (
                <form action={purgePartida}>
                  <input type="hidden" name="partidaId" value={p.id} />
                  <SubmitButton className="btn btn-accent" style={{ padding: "0.3rem 0.7rem", fontSize: "0.74rem" }}>{t.deleteForever}</SubmitButton>
                </form>
              ) : (
                <span className="mono text-steel" style={{ fontSize: "0.66rem" }}>{t.hasRecords}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the delete button into the partida page.** In `web/src/app/app/partidas/[id]/page.tsx`: read the role, and render the button in the header for admins/managers. Add the import:
```tsx
import { PartidaDeleteButton } from "@/components/partida-delete-button";
```
Change the session read to also get role:
```tsx
  const sessionUser = session!.user as { companyId: string; role: string };
  const companyId = sessionUser.companyId;
  const isAdmin = sessionUser.role === "ADMIN" || sessionUser.role === "MANAGER";
```
(Replace the existing `const companyId = (session!.user as { companyId: string }).companyId;` line with the three lines above.) Then, right after the `<h1>…{partida.name}</h1>` line, add:
```tsx
      {isAdmin && (
        <div style={{ marginBottom: 8 }}>
          <PartidaDeleteButton partidaId={partida.id} projectId={partida.projectId} t={{ del: t.project.del, delConfirm: t.project.delConfirm, yes: t.project.yes, no: t.project.no }} />
        </div>
      )}
```

- [ ] **Step 4: Wire the recycle list into the project page (Partidas tab).** In `web/src/app/app/projects/[id]/page.tsx`:
Add the import:
```tsx
import { PartidaRecycle } from "@/components/partida-recycle";
```
After the `selected`/`authorName` block, load deleted partidas (only needed for the code/Partidas tab):
```tsx
  const deletedPartidas = activeTab === "code" && isAdmin
    ? await prisma.partida.findMany({
        where: { projectId: id, deletedAt: { not: null } },
        include: { _count: { select: { registros: true } } },
        orderBy: { deletedAt: "desc" },
      })
    : [];
  const deleterIds = [...new Set(deletedPartidas.map((p) => p.deletedById).filter((x): x is string => !!x))];
  const deleters = deleterIds.length
    ? await prisma.user.findMany({ where: { id: { in: deleterIds }, companyId }, select: { id: true, name: true } })
    : [];
  const deleterMap = new Map(deleters.map((u) => [u.id, u.name]));
```
Then, inside the `else` (workspace/code) branch, right AFTER the closing `</div>` of `<div className="workspace">…</div>`, add the recycle list:
```tsx
          <PartidaRecycle
            rows={deletedPartidas}
            deleterMap={deleterMap}
            lang={lang}
            t={{ recycleTitle: P.recycleTitle, restore: P.restore, deleteForever: P.deleteForever, deletedBy: P.deletedBy, hasRecords: P.hasRecords }}
          />
```
(Wrap the workspace `<div>` and the `<PartidaRecycle>` in a React fragment `<>…</>` so the `else` arm returns one node. The existing `cambios`/`planos` arms are unchanged.)

- [ ] **Step 5: Typecheck + build** — `npx tsc --noEmit && npm run build` — Expected: exit 0 / success.

- [ ] **Step 6: Commit**
```bash
git add web/src/components/partida-delete-button.tsx web/src/components/partida-recycle.tsx "web/src/app/app/partidas/[id]/page.tsx" "web/src/app/app/projects/[id]/page.tsx"
git commit -m "feat(recycle): delete button + recycle bin (restore / delete-forever)"
```

---

### Task 6: Full verification

**Files:** none.

- [ ] **Step 1:** `npm test` — Expected: all green (existing + `partida-crud`).
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npm run build` — Expected: clean.
- [ ] **Step 3:** `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/` — Expected: no emoji.
- [ ] **Step 4: Manual pass** (admin login): open a Partida → **Borrar partida** (confirm) → it disappears from the tree and the dashboard count drops → the **Reciclaje** section in the Partidas tab lists it with "borrado por <name> · <date>" → **Restaurar** brings it back; for an empty partida, **Borrar definitivamente** removes it for good; a partida with entries shows "Contiene registros (no se puede borrar)". ES⇄EN; no emoji.

---

## Self-Review Notes

- **Spec coverage (§5.1):** delete Partidas (Tasks 1,3,5) · recycle bin with who/when (Tasks 1,3,5 via `deletedById`/`deletedAt`) · permanent delete only when empty, admin-only (Task 3 `purgePartida`) · deleted hidden everywhere (Task 4). Generalized AuditLog + rename/move = Phase 1c (noted).
- **Type consistency:** `deletePartida`/`restorePartida`/`purgePartida(formData)` (Task 3) consumed by the button (Task 5 Step 1) and recycle forms (Step 2). `DeletedRow = Partida & { _count: { registros } }` (Task 5) matches the project-page query include (Task 5 Step 4). `t.project.del/delConfirm/yes/no/recycleTitle/restore/deleteForever/deletedBy/hasRecords` (Task 2) consumed in Task 5.
- **Immutability:** `purgePartida` refuses when `registro.count > 0`; the recycle UI only shows "delete forever" for empty partidas, so the refuse path is server-side defense, not normal UX.
- **Deferred:** AuditLog, rename, move (1c); resident delete permission (P2).
```
