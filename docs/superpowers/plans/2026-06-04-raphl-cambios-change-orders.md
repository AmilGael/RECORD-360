# Cambios — Change Orders as Pull Requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Cambios tab — project-level change requests modeled as pull requests (Abierta → Integrada/Rechazada) that seal into the immutable record on approval.

**Architecture:** Additive Prisma models (`ChangeRequest`, `ChangeRequestPartida`, `ChangeAttachment`, `ChangeStatus`) plus a nullable `Registro.changeRequestId`. Two server actions (`createChangeRequest`, `resolveChangeRequest`); on integrate, atomically seal the request (content hash) and append a linked marker Registro to each affected partida via a new `appendRegistroTx` so the per-partida hash chain stays valid. RSC screens reuse the existing tab/workspace pattern and the `components/icons.tsx` line-icon set.

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), Prisma 6 + Postgres (Neon), next-auth v5, Vitest, TypeScript.

Spec: `docs/superpowers/specs/2026-06-04-raphl-cambios-change-orders-design.md`. Run all commands from `web/`.

---

## File Structure

- Create `web/src/lib/cambios/seal.ts` — `computeChangeSeal` (pure SHA-256 over frozen fields).
- Create `web/src/lib/cambios/validate.ts` — `parseChangeTitle`, `parseCostImpact`, `parseDaysImpact`.
- Create `web/src/app/actions/cambios.ts` — `createChangeRequest`, `resolveChangeRequest`.
- Create `web/src/components/cambios-list.tsx` — RSC list + create-form host.
- Create `web/src/components/cambios-create.tsx` — client create form (GPS capture).
- Create `web/src/app/app/projects/[id]/cambios/[crId]/page.tsx` — detail/review RSC.
- Modify `web/prisma/schema.prisma` — new models/enum + `Registro.changeRequestId`.
- Modify `web/src/lib/registro/append.ts` — extract `appendRegistroTx`, add `changeRequestId` to `AppendInput`.
- Modify `web/src/app/api/media/[key]/route.ts` — authorize `ChangeAttachment` evidence too.
- Modify `web/src/app/app/projects/[id]/page.tsx` — make Planos/Cambios tabs links; render list when `?tab=cambios`.
- Modify `web/src/i18n/dictionaries.ts` — extend `changes.*` (ES/EN).
- Modify `web/src/app/globals.css` — `.cr-*` classes.
- Tests: `web/tests/cambios-seal.test.ts`, `web/tests/cambios-validate.test.ts`, `web/tests/cambios-action.test.ts`, and extend `web/tests/media-route-auth.test.ts`.

---

### Task 1: Schema + migration

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: `web/prisma/migrations/<timestamp>_cambios_change_orders/migration.sql` (generated)

- [ ] **Step 1: Add the enum and models to `schema.prisma`** (append near the other models)

```prisma
enum ChangeStatus {
  OPEN
  INTEGRATED
  REJECTED
}

model ChangeRequest {
  id           String       @id @default(cuid())
  projectId    String
  project      Project      @relation(fields: [projectId], references: [id])
  code         String
  title        String
  description  String?
  costImpact   Decimal?     @db.Decimal(12, 2)
  daysImpact   Int?
  status       ChangeStatus @default(OPEN)
  authorId     String
  gpsLat       Decimal?     @db.Decimal(9, 6)
  gpsLng       Decimal?     @db.Decimal(9, 6)
  resolvedById String?
  resolvedAt   DateTime?
  seal         String?
  createdAt    DateTime     @default(now())

  partidas    ChangeRequestPartida[]
  attachments ChangeAttachment[]
  markers     Registro[]   @relation("RegistroChange")

  @@unique([projectId, code])
  @@index([projectId, status])
}

model ChangeRequestPartida {
  changeRequestId String
  changeRequest   ChangeRequest @relation(fields: [changeRequestId], references: [id], onDelete: Cascade)
  partidaId       String
  partida         Partida       @relation(fields: [partidaId], references: [id])

  @@id([changeRequestId, partidaId])
}

model ChangeAttachment {
  id              String         @id @default(cuid())
  changeRequestId String
  changeRequest   ChangeRequest  @relation(fields: [changeRequestId], references: [id], onDelete: Cascade)
  url             String
  sha256          String
  fileType        AttachmentType

  @@index([changeRequestId])
}
```

- [ ] **Step 2: Wire the back-relations** — add these lines inside the existing models:

In `model Project { ... }` add:
```prisma
  changeRequests ChangeRequest[]
```
In `model Partida { ... }` add:
```prisma
  changeRequests ChangeRequestPartida[]
```
In `model Registro { ... }` add (right after `correctionOfId String?`):
```prisma
  changeRequestId String?
  changeRequest   ChangeRequest? @relation("RegistroChange", fields: [changeRequestId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Create + apply the migration and regenerate the client**

Run: `npx prisma migrate dev --name cambios_change_orders`
Expected: a new folder under `prisma/migrations/`, "Your database is now in sync with your schema", and the Prisma client regenerated.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat(db): change-request models (Cambios) + Registro change link"
```

---

### Task 2: `computeChangeSeal` (pure)

**Files:**
- Create: `web/src/lib/cambios/seal.ts`
- Test: `web/tests/cambios-seal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { computeChangeSeal, type ChangeSealInput } from "@/lib/cambios/seal";

const base: ChangeSealInput = {
  code: "SC-1", title: "Refuerzo", description: "x",
  costImpact: "48000", daysImpact: 3,
  partidaIds: ["b", "a"], authorId: "u1",
  resolvedById: "u2", resolvedAt: new Date("2026-06-04T14:22:00Z"),
};

describe("computeChangeSeal", () => {
  it("is a 64-char hex digest and deterministic", () => {
    const a = computeChangeSeal(base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(computeChangeSeal(base));
  });
  it("is independent of partidaIds order", () => {
    expect(computeChangeSeal(base)).toBe(computeChangeSeal({ ...base, partidaIds: ["a", "b"] }));
  });
  it("changes when a sealed field changes", () => {
    expect(computeChangeSeal(base)).not.toBe(computeChangeSeal({ ...base, costImpact: "49000" }));
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npm test -- cambios-seal`
Expected: FAIL ("Cannot find module '@/lib/cambios/seal'").

- [ ] **Step 3: Implement**

```typescript
import { createHash } from "node:crypto";

export type ChangeSealInput = {
  code: string;
  title: string;
  description: string | null;
  costImpact: string | null;
  daysImpact: number | null;
  partidaIds: string[];
  authorId: string;
  resolvedById: string;
  resolvedAt: Date;
};

// Canonical SHA-256 over the frozen change-order content. Field order is fixed
// and partidaIds are sorted so the seal is stable regardless of input order.
export function computeChangeSeal(input: ChangeSealInput): string {
  const canonical = JSON.stringify({
    code: input.code,
    title: input.title,
    description: input.description,
    costImpact: input.costImpact,
    daysImpact: input.daysImpact,
    partidaIds: [...input.partidaIds].sort(),
    authorId: input.authorId,
    resolvedById: input.resolvedById,
    resolvedAt: input.resolvedAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- cambios-seal`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/cambios/seal.ts web/tests/cambios-seal.test.ts
git commit -m "feat(cambios): computeChangeSeal content hash"
```

---

### Task 3: Validation helpers

**Files:**
- Create: `web/src/lib/cambios/validate.ts`
- Test: `web/tests/cambios-validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseChangeTitle, parseCostImpact, parseDaysImpact } from "@/lib/cambios/validate";

describe("parseChangeTitle", () => {
  it("trims and returns", () => { expect(parseChangeTitle("  Refuerzo  ")).toBe("Refuerzo"); });
  it("rejects empty", () => { expect(() => parseChangeTitle("   ")).toThrow(); });
  it("rejects > 200 chars", () => { expect(() => parseChangeTitle("x".repeat(201))).toThrow(); });
});

describe("parseCostImpact", () => {
  it("empty -> null", () => { expect(parseCostImpact("")).toBeNull(); });
  it("allows negative", () => { expect(parseCostImpact("-1200.5")).toBe("-1200.5"); });
  it("rejects non-numeric", () => { expect(() => parseCostImpact("abc")).toThrow(); });
});

describe("parseDaysImpact", () => {
  it("empty -> null", () => { expect(parseDaysImpact("")).toBeNull(); });
  it("allows negative integer", () => { expect(parseDaysImpact("-2")).toBe(-2); });
  it("rejects decimals", () => { expect(() => parseDaysImpact("1.5")).toThrow(); });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test -- cambios-validate`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

```typescript
export function parseChangeTitle(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("El título es obligatorio.");
  if (v.length > 200) throw new Error("El título es demasiado largo (máx. 200 caracteres).");
  return v;
}

export function parseCostImpact(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("El impacto en costo debe ser numérico.");
  return String(n);
}

export function parseDaysImpact(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error("El impacto en tiempo debe ser un número entero de días.");
  return n;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- cambios-validate`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/cambios/validate.ts web/tests/cambios-validate.test.ts
git commit -m "feat(cambios): change-request input validators"
```

---

### Task 4: Extract `appendRegistroTx` + add `changeRequestId`

**Files:**
- Modify: `web/src/lib/registro/append.ts`

- [ ] **Step 1: Add `changeRequestId` to `AppendInput`** — add this line inside the `AppendInput` type (after `correctionOfId?: string | null;`):

```typescript
  changeRequestId?: string | null;
```

- [ ] **Step 2: Refactor the body to expose a tx-scoped variant.** Replace the entire `appendRegistro` function with:

```typescript
import { Prisma } from "@prisma/client";

export async function appendRegistroTx(tx: Prisma.TransactionClient, input: AppendInput) {
  const tip = await tx.registro.findFirst({
    where: { partidaId: input.partidaId },
    orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
  });
  const prevHash = tip ? tip.hash : GENESIS_PREV_HASH;
  const serverCreatedAt = new Date();
  const hash = computeHash(prevHash, {
    ledgerVersion: LEDGER_VERSION, category: input.category, text: input.text,
    progressPct: input.progressPct, authorId: input.authorId, locationId: input.locationId,
    gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt,
    attachments: input.attachments.map((a) => ({ fileType: a.fileType, sha256: a.sha256 })),
  });
  const created = await tx.registro.create({
    data: {
      partidaId: input.partidaId, authorId: input.authorId, category: input.category,
      text: input.text, progressPct: input.progressPct,
      gpsLat: input.gpsLat, gpsLng: input.gpsLng, locationId: input.locationId,
      ledgerVersion: LEDGER_VERSION, serverCreatedAt, prevHash, hash,
      correctionOfId: input.correctionOfId ?? null,
      changeRequestId: input.changeRequestId ?? null,
      attachments: {
        create: input.attachments.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })),
      },
    },
    include: { attachments: true },
  });
  if (input.progressPct !== null) {
    await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: input.progressPct } });
  }
  return created;
}

export async function appendRegistro(input: AppendInput) {
  return retryOnConflict(() => prisma.$transaction((tx) => appendRegistroTx(tx, input)));
}
```

(Keep the existing imports of `prisma`, `computeHash`, `GENESIS_PREV_HASH`, `retryOnConflict`, `LEDGER_VERSION` and the `AppendInput`/types; add the `Prisma` import shown above.)

- [ ] **Step 3: Verify existing registro tests still pass (hash unchanged, behavior identical)**

Run: `npm test -- append registro-action-correction`
Expected: PASS (all existing registro/append tests green — the refactor is behavior-preserving and `changeRequestId` is not part of `computeHash`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/registro/append.ts
git commit -m "refactor(registro): appendRegistroTx + changeRequestId passthrough"
```

---

### Task 5: `createChangeRequest` server action

**Files:**
- Create: `web/src/app/actions/cambios.ts`
- Test: `web/tests/cambios-action.test.ts`

- [ ] **Step 1: Write the failing test** (mirrors `tests/registro-action-correction.test.ts` setup)

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createChangeRequest, resolveChangeRequest } from "@/app/actions/cambios";

let companyId = "", managerId = "", residentId = "", projectId = "", pA = "", pB = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const company = await prisma.company.create({ data: { name: `CR Co ${s}` } });
  companyId = company.id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `CR Project ${s}` } })).id;
  pA = (await prisma.partida.create({ data: { projectId, name: "Cimentación N1" } })).id;
  pB = (await prisma.partida.create({ data: { projectId, name: "Instalaciones N2" } })).id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeRequestPartida.deleteMany({ where: { partidaId: { in: [pA, pB] } } });
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { id: { in: [pA, pB] } } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(entries: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}

describe("createChangeRequest", () => {
  it("creates an OPEN request linked to the affected partidas", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: "Refuerzo de zapata", description: "extra acero", costImpact: "48000", daysImpact: "3", partidaIds: [pA, pB] }));
    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Refuerzo de zapata" }, include: { partidas: true } });
    expect(cr.status).toBe("OPEN");
    expect(cr.code).toMatch(/^SC-\d+$/);
    expect(cr.partidas.map((p) => p.partidaId).sort()).toEqual([pA, pB].sort());
  });

  it("rejects when no partida is selected", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(createChangeRequest(fd({ projectId, title: "x", partidaIds: [] }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test -- cambios-action`
Expected: FAIL ("Cannot find module '@/app/actions/cambios'").

- [ ] **Step 3: Implement the action file** (resolve added in Task 6; include both signatures now so the import resolves)

```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { parseChangeTitle, parseCostImpact, parseDaysImpact } from "@/lib/cambios/validate";
import { computeChangeSeal } from "@/lib/cambios/seal";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { appendRegistroTx } from "@/lib/registro/append";
import { retryOnConflict } from "@/lib/registro/retry";

export async function createChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) throw new Error("Unauthorized");

  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } });
  if (!project) throw new Error("Forbidden");

  const title = parseChangeTitle(formData.get("title"));
  const description = (String(formData.get("description") ?? "").trim()) || null;
  const costImpact = parseCostImpact(formData.get("costImpact"));
  const daysImpact = parseDaysImpact(formData.get("daysImpact"));

  const partidaIds = [...new Set(formData.getAll("partidaIds").map(String).filter(Boolean))];
  if (partidaIds.length === 0) throw new Error("Selecciona al menos una partida afectada.");
  const valid = await prisma.partida.findMany({ where: { id: { in: partidaIds }, projectId }, select: { id: true } });
  if (valid.length !== partidaIds.length) throw new Error("Partida inválida.");

  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("evidence").filter((f): f is File => f instanceof File);
  const prepared = await prepareAttachments(photos, storage);

  await prisma.$transaction(async (tx) => {
    const count = await tx.changeRequest.count({ where: { projectId } });
    await tx.changeRequest.create({
      data: {
        projectId, code: `SC-${count + 1}`, title, description, costImpact, daysImpact,
        authorId: user.id!, gpsLat, gpsLng,
        partidas: { create: partidaIds.map((id) => ({ partidaId: id })) },
        attachments: { create: prepared.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })) },
      },
    });
  });
  revalidatePath(`/app/projects/${projectId}`);
}

export async function resolveChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");

  const crId = String(formData.get("changeRequestId"));
  const action = String(formData.get("action"));

  const cr = await prisma.changeRequest.findFirst({
    where: { id: crId, project: { companyId: user.companyId } },
    include: { partidas: { select: { partidaId: true } } },
  });
  if (!cr) throw new Error("Forbidden");
  if (cr.status !== "OPEN") throw new Error("La solicitud ya fue resuelta.");
  if (cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");

  const resolvedAt = new Date();
  if (action === "REJECT") {
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt } });
  } else if (action === "INTEGRATE") {
    const seal = computeChangeSeal({
      code: cr.code, title: cr.title, description: cr.description,
      costImpact: cr.costImpact ? cr.costImpact.toString() : null,
      daysImpact: cr.daysImpact, partidaIds: cr.partidas.map((p) => p.partidaId),
      authorId: cr.authorId, resolvedById: user.id, resolvedAt,
    });
    const markerText = `Cambio ${cr.code} integrado` +
      (cr.costImpact ? ` · ${cr.costImpact.toString()}` : "") +
      (cr.daysImpact != null ? ` · ${cr.daysImpact}d` : "");
    await retryOnConflict(() => prisma.$transaction(async (tx) => {
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal } });
      for (const { partidaId } of cr.partidas) {
        await appendRegistroTx(tx, {
          partidaId, authorId: user.id!, category: null, text: markerText,
          progressPct: null, gpsLat: null, gpsLng: null, locationId: null,
          attachments: [], changeRequestId: cr.id,
        });
      }
    }));
  } else {
    throw new Error("Acción inválida.");
  }
  revalidatePath(`/app/projects/${cr.projectId}`);
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- cambios-action`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/actions/cambios.ts web/tests/cambios-action.test.ts
git commit -m "feat(cambios): createChangeRequest + resolveChangeRequest actions"
```

---

### Task 6: Integration & guard tests for `resolveChangeRequest`

**Files:**
- Modify: `web/tests/cambios-action.test.ts`

- [ ] **Step 1: Add resolve tests** (append inside the file, new `describe` block)

```typescript
import { verifyChain } from "@/lib/registro/hash";

async function openCR(authorId: string, partidaIds: string[]) {
  authMock.mockResolvedValue({ user: { id: authorId, companyId, role: "RESIDENT" } });
  await createChangeRequest(fd({ projectId, title: `T-${Math.random()}`, costImpact: "1000", daysImpact: "2", partidaIds }));
  return prisma.changeRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { projectId } });
}

describe("resolveChangeRequest", () => {
  it("INTEGRATE seals the request and appends a linked marker per partida (chain stays valid)", async () => {
    const cr = await openCR(residentId, [pA, pB]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }));

    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("INTEGRATED");
    expect(after.seal).toMatch(/^[0-9a-f]{64}$/);

    for (const partidaId of [pA, pB]) {
      const marker = await prisma.registro.findFirst({ where: { partidaId, changeRequestId: cr.id } });
      expect(marker).not.toBeNull();
      const chain = await prisma.registro.findMany({ where: { partidaId }, orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }] });
      expect(verifyChain(chain.map((r) => ({ ...r, gpsLat: r.gpsLat ? Number(r.gpsLat) : null, gpsLng: r.gpsLng ? Number(r.gpsLng) : null, attachments: [] }))).ok).toBe(true);
    }
  });

  it("REJECT marks rejected with no seal and no markers", async () => {
    const cr = await openCR(residentId, [pA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT" }));
    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.seal).toBeNull();
    expect(await prisma.registro.count({ where: { changeRequestId: cr.id } })).toBe(0);
  });

  it("rejects a non-manager", async () => {
    const cr = await openCR(residentId, [pA]);
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }))).rejects.toThrow();
  });

  it("forbids resolving your own request", async () => {
    const cr = await openCR(managerId, [pA]); // opened by the manager
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }))).rejects.toThrow(/propia/i);
  });
});
```

> Note: `verifyChain` expects `StoredRegistro[]` with numeric gps and an `attachments` array of `{ fileType, sha256 }`. Markers carry no attachments, so mapping `attachments: []` is correct for these chains. If a partida already had attachment-bearing registros from other tests, scope `pA`/`pB` are created fresh in this suite, so only markers exist.

- [ ] **Step 2: Run it (passes)**

Run: `npm test -- cambios-action`
Expected: PASS (6 tests total).

- [ ] **Step 3: Commit**

```bash
git add web/tests/cambios-action.test.ts
git commit -m "test(cambios): resolve integration + guard coverage"
```

---

### Task 7: Authorize ChangeAttachment evidence in the media route

**Files:**
- Modify: `web/src/app/api/media/[key]/route.ts`
- Modify: `web/tests/media-route-auth.test.ts`

- [ ] **Step 1: Write the failing test** — append to `media-route-auth.test.ts` inside the existing `describe`:

```typescript
  it("serves change-request evidence for a user in the owning company", async () => {
    const cr = await prisma.changeRequest.create({
      data: { projectId: projectAId, code: "SC-EV", title: "ev", authorId: userAId,
        attachments: { create: [{ url: "/api/media/cr-evid.png", sha256: "b".repeat(64), fileType: "IMAGE" }] } },
    });
    authMock.mockResolvedValue({ user: { id: userAId, companyId: companyAId } });
    const res = await GET(new Request("http://test.local/api/media/cr-evid.png"), { params: Promise.resolve({ key: "cr-evid.png" }) });
    expect(res.status).toBe(200);
    await prisma.changeAttachment.deleteMany({ where: { changeRequestId: cr.id } });
    await prisma.changeRequest.deleteMany({ where: { id: cr.id } });
  });
```

(`projectAId` already exists in this test's `beforeAll`. If it is not currently exported to a module-level `let`, add `let projectAId = "";` near the other `let`s and assign it where `projectA` is created.)

- [ ] **Step 2: Run it (fails — CR evidence 404s)**

Run: `npm test -- media-route-auth`
Expected: FAIL (status 404, route doesn't know ChangeAttachment).

- [ ] **Step 3: Update the route** — replace the Attachment lookup block with a dual lookup:

```typescript
  const url = `/api/media/${safeKey}`;
  const owned =
    (await prisma.attachment.findFirst({
      where: { url, registro: { partida: { project: { companyId: user.companyId } } } },
      select: { id: true },
    })) ??
    (await prisma.changeAttachment.findFirst({
      where: { url, changeRequest: { project: { companyId: user.companyId } } },
      select: { id: true },
    }));
  if (!owned) return new Response("Not found", { status: 404 });
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- media-route-auth`
Expected: PASS (existing + new test green).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/media/[key]/route.ts web/tests/media-route-auth.test.ts
git commit -m "fix(security): authorize ChangeAttachment evidence in media route"
```

---

### Task 8: i18n strings

**Files:**
- Modify: `web/src/i18n/dictionaries.ts`

- [ ] **Step 1: Extend the ES `changes` block** — replace the ES `changes: { ... }` object with:

```typescript
    changes: {
      item: "Solicitud de cambio",
      itemPlural: "Solicitudes de cambio",
      new: "Nueva solicitud",
      empty: "Sin solicitudes de cambio todavía.",
      review: "Revisar",
      integrate: "Integrar al expediente",
      reject: "Rechazar",
      states: { OPEN: "Abierta", INTEGRATED: "Integrada", REJECTED: "Rechazada" },
      fieldTitle: "Título",
      fieldDescription: "Descripción",
      fieldPartidas: "Partidas afectadas",
      impactCost: "Costo",
      impactTime: "Tiempo",
      evidence: "Evidencia",
      requester: "Solicitante",
      resolvedBy: "Resuelta por",
      seal: "Sello",
      managerOnly: "Visible solo para Gerente / Admin",
      days: "días",
    },
```

- [ ] **Step 2: Extend the EN `changes` block** — replace the EN `changes: { ... }` object with:

```typescript
    changes: {
      item: "Change request",
      itemPlural: "Change requests",
      new: "New request",
      empty: "No change requests yet.",
      review: "Review",
      integrate: "Integrate into record",
      reject: "Reject",
      states: { OPEN: "Open", INTEGRATED: "Integrated", REJECTED: "Rejected" },
      fieldTitle: "Title",
      fieldDescription: "Description",
      fieldPartidas: "Affected work items",
      impactCost: "Cost",
      impactTime: "Time",
      evidence: "Evidence",
      requester: "Requested by",
      resolvedBy: "Resolved by",
      seal: "Seal",
      managerOnly: "Visible to Manager / Admin only",
      days: "days",
    },
```

- [ ] **Step 3: Typecheck (ES/EN shapes must match — `Dict` derives from `es`)**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/i18n/dictionaries.ts
git commit -m "i18n: change-request field + action strings"
```

---

### Task 9: Cambios list + create form UI

**Files:**
- Create: `web/src/components/cambios-create.tsx`
- Create: `web/src/components/cambios-list.tsx`

- [ ] **Step 1: Create the client create form** `web/src/components/cambios-create.tsx`

```tsx
"use client";
import { useRef, useState } from "react";
import { createChangeRequest } from "@/app/actions/cambios";
import { SubmitButton } from "@/components/submit-button";

type T = {
  new: string; fieldTitle: string; fieldDescription: string; fieldPartidas: string;
  impactCost: string; impactTime: string; evidence: string; gps: string; gpsOk: string;
};

export function CambiosCreate({ projectId, partidas, t }: {
  projectId: string;
  partidas: { id: string; name: string }[];
  t: T;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => { await createChangeRequest(fd); formRef.current?.reset(); setCoords(null); }}
      className="card"
      style={{ padding: 16, marginBottom: 20 }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <input name="title" required placeholder={t.fieldTitle} className="input" style={{ marginBottom: 10 }} />
      <textarea name="description" rows={2} placeholder={t.fieldDescription} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      <div className="form-label" style={{ marginBottom: 4 }}>{t.fieldPartidas}</div>
      <select name="partidaIds" multiple required className="input" style={{ marginBottom: 10, minHeight: 90 }}>
        {partidas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input name="costImpact" inputMode="decimal" placeholder={`${t.impactCost} (RD$)`} className="input" style={{ maxWidth: 160 }} />
        <input name="daysImpact" inputMode="numeric" placeholder={t.impactTime} className="input" style={{ maxWidth: 120 }} />
        <input type="file" name="evidence" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ fontSize: "0.8rem", maxWidth: 200 }} />
        <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}
          onClick={() => navigator.geolocation?.getCurrentPosition((pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }))}>
          {coords ? t.gpsOk : t.gps}
        </button>
        <SubmitButton className="btn btn-accent" style={{ marginLeft: "auto" }}>{t.new}</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the list RSC** `web/src/components/cambios-list.tsx`

```tsx
import Link from "next/link";
import type { ChangeStatus } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { CambiosCreate } from "@/components/cambios-create";

type Row = {
  id: string; code: string; title: string; status: ChangeStatus;
  costImpact: string | null; daysImpact: number | null; createdAt: Date;
  seal: string | null; partidaCount: number;
};
type ListT = {
  empty: string; states: Record<ChangeStatus, string>; days: string;
} & React.ComponentProps<typeof CambiosCreate>["t"];

const dotClass: Record<ChangeStatus, string> = { OPEN: "open", INTEGRATED: "merged", REJECTED: "rej" };

export function CambiosList({
  projectId, rows, partidas, lang, t,
}: {
  projectId: string;
  rows: Row[];
  partidas: { id: string; name: string }[];
  lang: Lang;
  t: ListT;
}) {
  return (
    <div>
      <CambiosCreate projectId={projectId} partidas={partidas} t={t} />
      <div className="repo-list">
        {rows.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/app/projects/${projectId}/cambios/${r.id}`} className="cr-row">
            <span className={`pdot ${dotClass[r.status]}`} aria-hidden="true" />
            <span className="cr-main">
              <span className="cr-title">{r.code} · {r.title}</span>
              <span className="cr-meta">{r.partidaCount} · {t.states[r.status]} · {formatTimestamp(r.createdAt, lang)}{r.seal ? ` · ${r.seal.slice(0, 7)}` : ""}</span>
            </span>
            {(r.costImpact || r.daysImpact != null) && (
              <span className="cr-cost">{r.costImpact ? `RD$${r.costImpact}` : ""}{r.daysImpact != null ? ` · ${r.daysImpact}${t.days[0]}` : ""}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/cambios-create.tsx web/src/components/cambios-list.tsx
git commit -m "feat(cambios): list + create-form components"
```

---

### Task 10: Change-request detail / review page

**Files:**
- Create: `web/src/app/app/projects/[id]/cambios/[crId]/page.tsx`

- [ ] **Step 1: Create the detail RSC**

```tsx
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { formatTimestamp } from "@/lib/format/datetime";
import { resolveChangeRequest } from "@/app/actions/cambios";
import { SubmitButton } from "@/components/submit-button";
import { Pin } from "@/components/icons";
import type { Lang } from "@/i18n/dictionaries";

export default async function CambioDetail({ params }: { params: Promise<{ id: string; crId: string }> }) {
  const { id, crId } = await params;
  const session = await auth();
  const u = session!.user as { id: string; companyId: string; role: string };
  const { lang, t } = await getDict();
  const C = t.changes;

  const cr = await prisma.changeRequest.findFirstOrThrow({
    where: { id: crId, projectId: id, project: { companyId: u.companyId } },
    include: { partidas: { include: { partida: { select: { name: true } } } }, attachments: true },
  });

  const isManager = u.role === "ADMIN" || u.role === "MANAGER";
  const canResolve = isManager && cr.status === "OPEN" && cr.authorId !== u.id;
  const dot = cr.status === "OPEN" ? "open" : cr.status === "INTEGRATED" ? "merged" : "rej";

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <Link href={`/app/projects/${id}?tab=cambios`} className="kicker" style={{ textDecoration: "none" }}>← {C.itemPlural}</Link>
      <div className="cr-detail card" style={{ marginTop: 12 }}>
        <div className="cr-detail-head">
          <span className="mono" style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}>{cr.code}</span>
          <span className="state-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={`pdot ${dot}`} aria-hidden="true" /> {C.states[cr.status]}
          </span>
        </div>
        <Field label={C.fieldTitle}><span className="h-md" style={{ fontSize: "1.05rem" }}>{cr.title}</span></Field>
        {cr.description && <Field label={C.fieldDescription}>{cr.description}</Field>}
        <Field label={C.fieldPartidas}>
          {cr.partidas.map((p) => <span key={p.partidaId} className="chip">{p.partida.name}</span>)}
        </Field>
        <Field label={`${C.impactCost} / ${C.impactTime}`}>
          <span className="cr-cost">{cr.costImpact ? `RD$${cr.costImpact.toString()}` : "—"}</span>
          {" · "}
          <span>{cr.daysImpact != null ? `${cr.daysImpact} ${C.days}` : "—"}</span>
        </Field>
        <Field label={C.requester}>
          {cr.gpsLat != null && <><Pin size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{`${Number(cr.gpsLat).toFixed(4)} · `}</>}
          {formatTimestamp(cr.createdAt, lang as Lang)}
        </Field>
        {cr.status === "INTEGRATED" && cr.seal && (
          <Field label={C.seal}><span className="mono">{cr.seal.slice(0, 8)}…{cr.seal.slice(-4)}</span> · {cr.resolvedAt ? formatTimestamp(cr.resolvedAt, lang as Lang) : ""}</Field>
        )}
        {canResolve && (
          <div className="cr-actions">
            <form action={resolveChangeRequest}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="INTEGRATE" />
              <SubmitButton className="btn" style={{ background: "var(--state-merged)", color: "#fff" }}>{C.integrate}</SubmitButton>
            </form>
            <form action={resolveChangeRequest}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="REJECT" />
              <SubmitButton className="btn btn-ghost">{C.reject}</SubmitButton>
            </form>
            <span className="mono text-steel" style={{ fontSize: "0.62rem", marginLeft: "auto", alignSelf: "center" }}>{C.managerOnly}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cr-field">
      <div className="form-label">{label}</div>
      <div style={{ marginTop: 3, fontSize: "0.88rem" }}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/app/projects/[id]/cambios/[crId]/page.tsx"
git commit -m "feat(cambios): change-request detail + review page"
```

---

### Task 11: Activate the Cambios tab + render the list; add CSS

**Files:**
- Modify: `web/src/app/app/projects/[id]/page.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Read `tab` and load change requests.** In `page.tsx`, change the `searchParams` type to include `tab` and add the query. Update the signature:

```tsx
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { p: selectedId, tab } = await searchParams;
```

Then after `segmentNames` is computed, add:

```tsx
  const activeTab = tab === "cambios" ? "cambios" : "code";
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
```

- [ ] **Step 2: Make Planos/Cambios real tabs and branch the body.** Replace the tab bar + workspace markup with:

```tsx
      <div className="tabs">
        <Link href={`/app/projects/${id}?tab=code`} className={`tab ${activeTab === "code" ? "is-on" : ""}`} aria-current={activeTab === "code" ? "page" : undefined}><Layers size={13} />{P.tabCode}</Link>
        <Link href={`/app/projects/${id}?tab=cambios`} className={`tab ${activeTab === "cambios" ? "is-on" : ""}`} aria-current={activeTab === "cambios" ? "page" : undefined}><Branch size={13} />{P.tabChanges}</Link>
        <span className="tab is-off" aria-disabled="true"><BarChart size={13} />{P.tabAnalytics} <span className="soon">{P.soon}</span></span>
        <span className="tab is-off" aria-disabled="true"><Sliders size={13} />{P.tabSettings} <span className="soon">{P.soon}</span></span>
      </div>

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
      ) : (
        <div className="workspace">
          {/* existing ProjectFileTree + PartidaSummary block unchanged */}
        </div>
      )}
```

Keep the existing `<div className="workspace">…</div>` contents exactly as they are inside the `else` branch. Add the import at the top:

```tsx
import { CambiosList } from "@/components/cambios-list";
```

(`Layers, Branch, BarChart, Sliders` are already imported from the emoji purge.)

- [ ] **Step 2b: Remove the now-unused `aria-hidden` stub note** — the old Cambios `<span class="tab is-off">…Próx</span>` is replaced by the Link above; ensure no duplicate Cambios tab remains.

- [ ] **Step 3: Add CSS** — append to `globals.css`:

```css
/* ---------- cambios (change requests) ---------- */
.pdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.pdot.open { background: var(--state-active); }
.pdot.merged { background: var(--state-merged); }
.pdot.rej { background: var(--state-blocked); }

.cr-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line); text-decoration: none; color: var(--ink); transition: background 0.18s var(--ease); }
.cr-row:last-child { border-bottom: none; }
.cr-row:hover { background: var(--paper-2); }
.cr-main { flex: 1; min-width: 0; }
.cr-title { font-weight: 700; font-size: 0.92rem; display: block; }
.cr-meta { font-family: var(--font-mono), monospace; font-size: 0.64rem; color: var(--steel); margin-top: 3px; display: block; }
.cr-cost { font-family: var(--font-mono), monospace; font-size: 0.74rem; font-weight: 700; color: var(--accent-deep); white-space: nowrap; }

.cr-detail-head { display: flex; justify-content: space-between; align-items: center; padding: 11px 15px; background: var(--ink); color: var(--paper); border-radius: var(--radius) var(--radius) 0 0; }
.cr-field { padding: 11px 15px; border-bottom: 1px dashed var(--line); }
.cr-field:last-child { border-bottom: none; }
.cr-actions { display: flex; gap: 8px; padding: 13px 15px; background: var(--paper-2); }
.cr-detail .chip { display: inline-flex; align-items: center; font-size: 0.66rem; background: var(--paper-2); border: 1px solid var(--line-strong); padding: 3px 9px; border-radius: 99px; margin: 2px 4px 2px 0; font-family: var(--font-mono), monospace; }
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 / no lint errors / build succeeds (the `/app/projects/[id]/cambios/[crId]` route appears in the route list).

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/app/projects/[id]/page.tsx" web/src/app/globals.css
git commit -m "feat(cambios): activate Cambios tab, render list, styles"
```

---

### Task 12: Full verification + manual pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all files green, including the new `cambios-seal`, `cambios-validate`, `cambios-action`, and the extended `media-route-auth`.

- [ ] **Step 2: Lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: No emoji regression**

Run: `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{FF0B}\x{25A0}-\x{25FF}]' src/`
Expected: no matches.

- [ ] **Step 4: Manual pass** (`npm run dev`, log in as `admin@record360.do` / `demo1234`)

  - Open a project → the **Cambios** tab is now clickable.
  - Create a request against two partidas with cost + days → it shows **Abierta** in the list with the cost/time.
  - As a Manager, open the detail and **Integrar al expediente** → status becomes **Integrada**, a seal shows, and both affected partidas' bitácoras show a linked "Cambio SC-N integrado" entry; the partida hash chain still verifies (no chain error in logs).
  - Confirm a Resident cannot see the integrate/reject actions, and the author cannot resolve their own request.
  - Toggle ES⇄EN; confirm all labels translate and there is **no emoji** anywhere.

- [ ] **Step 5: Final commit (if any manual-pass fixes were needed)**

```bash
git add -A && git commit -m "chore(cambios): manual-pass fixes"
```

---

## Self-Review Notes

- **Spec coverage:** anchoring (Task 11 URL/list), Integrada seal+markers (Tasks 2/4/5/6), two-step manager-gated flow + guards (Tasks 5/6), schema (Task 1), field set (Tasks 5/9/10), screens (Tasks 9/10/11), media-auth extension (Task 7), i18n (Task 8), tests (Tasks 2/3/5/6/7), no-emoji (Task 12 Step 3). All covered.
- **Type consistency:** `appendRegistroTx(tx, AppendInput)` and `AppendInput.changeRequestId` (Task 4) are used by `resolveChangeRequest` (Task 5). `computeChangeSeal`/`ChangeSealInput` (Task 2) consumed in Task 5. `CambiosCreate`'s `t` prop is reused via `React.ComponentProps` in `CambiosList` (Task 9) and supplied in Task 11. `ChangeStatus` dot mapping (`OPEN→open`, `INTEGRATED→merged`, `REJECTED→rej`) is identical in list, detail, and CSS.
- **Deferred (per spec non-goals):** comments thread, Pre-autorizada 3rd state, digital signatures, PDF export.
```
