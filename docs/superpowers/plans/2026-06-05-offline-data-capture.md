# Offline Data Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline-first capture of Registros (notes + media + GPS) into a local IndexedDB queue, synced to the server-authoritative hash chain via an idempotent endpoint, without changing the immutable hash payload.

**Architecture:** Capture content locally (text, files-as-blobs, GPS, location label, capture time, a client UUID) → render optimistically as *pending* → a sync engine POSTs each entry to `/api/offline/registros` when online → the server dedupes by UUID and `appendRegistro`s it (assigning chain position at arrival). `idempotencyKey` + `clientCapturedAt` are stored but excluded from `computeHash` (server-seal time stays the sealed time).

**Tech Stack:** Next.js 15 (App Router, route handlers, server actions), Prisma 6 / Neon, React 19 client components, IndexedDB via `idb`, Vitest + `fake-indexeddb`.

**Design doc:** `docs/superpowers/specs/2026-06-05-offline-data-capture-design.md`

**Conventions (must follow):** multi-tenant `companyId` scoping + `projectAccessWhere`; additive migrations only (never `migrate reset`); NO EMOJI; ES/EN dict shapes synced (`Dict` derives from `es`); the Registro hash chain is immutable — new columns stay OUT of `computeHash`; gates per task: `npm test`, `npx tsc --noEmit`, `npm run lint`, emoji scan (skip `npm run build` — dev server runs on :3000). Commit per task; do not push.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (+ migration `add_offline_capture`) | `Registro.idempotencyKey String? @unique`, `Registro.clientCapturedAt DateTime?` |
| `src/lib/registro/append.ts` | accept + store the two fields; keep out of `computeHash`; extend LEDGER CONTRACT comment |
| `src/app/api/offline/registros/route.ts` | POST: idempotent, tenant-scoped, multipart sync endpoint (full `logRegistro` parity) |
| `src/lib/offline/types.ts` | `QueuedRegistro`, `QueuedAttachment`, `OfflineQueue` |
| `src/lib/offline/queue.ts` | `IndexedDbQueue` (idb) + `InMemoryQueue` (tests) |
| `src/lib/offline/sync.ts` | `syncQueue` engine: drain/retry/backoff, injected deps |
| `src/lib/offline/serialize.ts` | build `FormData` from a `QueuedRegistro` (shared by sync + tests) |
| `src/components/log-composer.tsx` | offline-first: enqueue → optimistic → kick sync |
| `src/components/pending-entries.tsx` | per-partida pending list + Reintentar/error |
| `src/components/sync-indicator.tsx` | nav "N pendientes" / syncing state |
| `src/components/offline-provider.tsx` | kick sync on load + `online`; expose count |
| `src/components/record-card.tsx` | show `Capturado` vs `Sellado` when `clientCapturedAt` present |
| `src/i18n/dictionaries.ts` | `offlineCapture` strings (ES/EN) |
| Tests | `append-offline-fields.test.ts`, `offline-registros-route.test.ts`, `offline-queue.test.ts`, `offline-sync.test.ts` |

---

## Phase 2a — Server (headless, fully testable)

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (model `Registro`)

- [ ] **Step 1: Add the two columns to `Registro`**

In `model Registro`, add (idempotency uniqueness is **partida-scoped**, not global — prevents IDOR-via-dedup):
```prisma
  idempotencyKey   String?              // client UUID for offline-capture dedupe; NOT in computeHash
  clientCapturedAt DateTime?            // when written on-site (offline); NOT in computeHash; metadata only
  // ... and in the model's index block:
  @@unique([partidaId, idempotencyKey])
```

- [ ] **Step 2: Create + apply the additive migration**

Run: `npx prisma migrate dev --name add_offline_capture`
Expected: a new migration under `prisma/migrations/`, applied cleanly (additive — both columns nullable). Then `npx prisma generate`.
NEVER run `migrate reset`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Registro idempotencyKey + clientCapturedAt for offline capture"
```

---

### Task 2: appendRegistro stores the fields, kept out of the hash

**Files:**
- Modify: `src/lib/registro/append.ts`
- Test: `web/tests/append-offline-fields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeAll, expect, it, describe } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { verifyChain } from "@/lib/registro/hash";
import { toStored } from "@/lib/registro/map";

let companyId = "", authorId = "", projectId = "", partidaId = "";
beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Off Co ${s}` } })).id;
  authorId = (await prisma.user.create({ data: { email: `o-${s}@x.do`, name: "O", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Off P ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "off" } })).id;
});
afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: authorId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("appendRegistro offline fields", () => {
  it("stores idempotencyKey + clientCapturedAt but keeps them out of the hash", async () => {
    const captured = new Date("2026-06-01T14:03:00.000Z");
    const rec = await appendRegistro({
      partidaId, authorId, category: null, text: "campo", progressPct: null,
      gpsLat: null, gpsLng: null, locationId: null, attachments: [],
      idempotencyKey: "uuid-123", clientCapturedAt: captured,
    });
    expect(rec.idempotencyKey).toBe("uuid-123");
    expect(rec.clientCapturedAt?.toISOString()).toBe(captured.toISOString());
    // The chain still verifies — proving the new fields are NOT in the hash payload
    // (verifyChain/toStored recompute the hash without them).
    const stored = await prisma.registro.findMany({ where: { partidaId }, orderBy: { serverCreatedAt: "asc" } });
    expect(verifyChain(stored.map(toStored)).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`idempotencyKey` not on `AppendInput`)

Run: `npx vitest run tests/append-offline-fields.test.ts`
Expected: TS error / runtime failure (field unknown).

- [ ] **Step 3: Extend `AppendInput` + persistence (NOT the hash)**

In `src/lib/registro/append.ts`:
- Add to `AppendInput`: `idempotencyKey?: string | null;` and `clientCapturedAt?: Date | null;`
- In `appendRegistroTx`, add to the `create` `data` (do NOT touch the `computeHash(...)` call):
```ts
      idempotencyKey: input.idempotencyKey ?? null,
      clientCapturedAt: input.clientCapturedAt ?? null,
```
- Extend the LEDGER CONTRACT comment to add `idempotencyKey, clientCapturedAt` to the list of fields that MUST stay out of the hash payload.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/append-offline-fields.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registro/append.ts tests/append-offline-fields.test.ts
git commit -m "feat(ledger): appendRegistro stores offline fields, excluded from hash"
```

---

### Task 3: Idempotent sync endpoint

**Files:**
- Create: `src/app/api/offline/registros/route.ts`
- Test: `web/tests/offline-registros-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { POST } from "@/app/api/offline/registros/route";

let companyId = "", userId = "", otherCo = "", otherUser = "", projectId = "", partidaId = "";
beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Sync Co ${s}` } })).id;
  userId = (await prisma.user.create({ data: { email: `s-${s}@x.do`, name: "S", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  otherCo = (await prisma.company.create({ data: { name: `Other ${s}` } })).id;
  otherUser = (await prisma.user.create({ data: { email: `x-${s}@x.do`, name: "X", role: "ADMIN", companyId: otherCo, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Sync P ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "sync" } })).id;
});
afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { id: partidaId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUser] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCo] } } });
  await prisma.$disconnect();
});
beforeEach(() => authMock.mockReset());

function req(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/offline/registros", { method: "POST", body: fd });
}
const asUser = () => authMock.mockResolvedValue({ user: { id: userId, companyId, role: "ADMIN" } });

describe("POST /api/offline/registros", () => {
  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ partidaId, idempotencyKey: "k1", text: "x" }));
    expect(res.status).toBe(401);
  });
  it("404 when the partida is not in the caller's tenant/access", async () => {
    authMock.mockResolvedValue({ user: { id: otherUser, companyId: otherCo, role: "ADMIN" } });
    const res = await POST(req({ partidaId, idempotencyKey: "k2", text: "x" }));
    expect(res.status).toBe(404);
  });
  it("creates a registro with idempotencyKey + clientCapturedAt", async () => {
    asUser();
    const res = await POST(req({ partidaId, idempotencyKey: "k3", text: "hola", clientCapturedAt: "2026-06-01T14:03:00.000Z" }));
    expect(res.status).toBe(200);
    const rec = await prisma.registro.findFirst({ where: { idempotencyKey: "k3" } });
    expect(rec?.text).toBe("hola");
    expect(rec?.clientCapturedAt?.toISOString()).toBe("2026-06-01T14:03:00.000Z");
  });
  it("is idempotent: same key twice → one row, returns existing id", async () => {
    asUser();
    const a = await POST(req({ partidaId, idempotencyKey: "k4", text: "once" }));
    const b = await POST(req({ partidaId, idempotencyKey: "k4", text: "once" }));
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(await prisma.registro.count({ where: { idempotencyKey: "k4" } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (route does not exist).

- [ ] **Step 3: Implement the route**

`src/app/api/offline/registros/route.ts`:
```ts
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseCategory, parseLocation } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const partidaId = String(form.get("partidaId") ?? "");
  const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
  if (!idempotencyKey) return Response.json({ error: "idempotencyKey requerido" }, { status: 400 });

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
  });
  if (!partida) return Response.json({ error: "Not found" }, { status: 404 });

  // Idempotency: if this entry already landed, return it without creating a dup.
  // SCOPED to the (already access-checked) partida — never look up by key alone,
  // which would let replay resolve cross-tenant (IDOR-via-dedup). Uniqueness is
  // @@unique([partidaId, idempotencyKey]).
  const existing = await prisma.registro.findFirst({ where: { partidaId, idempotencyKey }, select: { id: true } });
  if (existing) return Response.json({ id: existing.id, deduped: true }, { status: 200 });

  try {
    const text = (String(form.get("text") ?? "").trim()) || null;
    const category = parseCategory(form.get("category"));
    const latRaw = form.get("gpsLat"); const lngRaw = form.get("gpsLng");
    const gpsLat = latRaw ? Number(latRaw) : null;
    const gpsLng = lngRaw ? Number(lngRaw) : null;

    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    const attachments = await prepareAttachments(files, storage);

    const locationLabel = parseLocation(form.get("location"));
    let locationId: string | null = null;
    if (locationLabel) {
      const loc = await prisma.location.upsert({
        where: { projectId_label: { projectId: partida.projectId, label: locationLabel } },
        create: { projectId: partida.projectId, label: locationLabel }, update: {},
      });
      locationId = loc.id;
    }

    const corrRaw = form.get("correctionOfId");
    const correctionOfId = typeof corrRaw === "string" && corrRaw.trim() ? corrRaw.trim() : null;
    if (correctionOfId && !(await prisma.registro.findFirst({ where: { id: correctionOfId, partidaId }, select: { id: true } })))
      return Response.json({ error: "Destino de corrección inválido." }, { status: 400 });
    const repRaw = form.get("replyToId");
    const replyToId = typeof repRaw === "string" && repRaw.trim() ? repRaw.trim() : null;
    if (replyToId && !(await prisma.registro.findFirst({ where: { id: replyToId, partidaId }, select: { id: true } })))
      return Response.json({ error: "Destino de respuesta inválido." }, { status: 400 });

    const remRaw = String(form.get("reminderDueAt") ?? "").trim();
    const reminderDueAt = remRaw ? new Date(remRaw) : null;
    if (reminderDueAt && Number.isNaN(reminderDueAt.getTime()))
      return Response.json({ error: "Recordatorio inválido." }, { status: 400 });

    const capRaw = String(form.get("clientCapturedAt") ?? "").trim();
    const clientCapturedAt = capRaw ? new Date(capRaw) : null;
    if (clientCapturedAt && Number.isNaN(clientCapturedAt.getTime()))
      return Response.json({ error: "Fecha de captura inválida." }, { status: 400 });

    const rec = await appendRegistro({
      partidaId, authorId: user.id, category, text, progressPct: null,
      gpsLat, gpsLng, locationId, attachments, correctionOfId, replyToId, reminderDueAt,
      idempotencyKey, clientCapturedAt,
    });
    revalidatePath(`/app/projects/${partida.projectId}`);
    revalidatePath(`/app/partidas/${partidaId}`);
    revalidatePath("/app");
    return Response.json({ id: rec.id }, { status: 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo registrar." }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/offline-registros-route.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/offline/registros/route.ts tests/offline-registros-route.test.ts
git commit -m "feat(api): idempotent offline-capture sync endpoint"
```

---

## Phase 2b — Client core (testable)

### Task 4: Offline types + queue

**Files:**
- Create: `src/lib/offline/types.ts`, `src/lib/offline/queue.ts`
- Test: `web/tests/offline-queue.test.ts`
- Deps: `idb` (runtime), `fake-indexeddb` (dev)

- [ ] **Step 1: Install deps**

Run: `npm install idb` and `npm install -D fake-indexeddb`.

- [ ] **Step 2: Write `types.ts`** (no test — pure types)

```ts
export interface QueuedAttachment { blob: Blob; filename: string; contentType: string; }
export interface QueuedRegistro {
  id: string;                 // client UUID == idempotencyKey
  partidaId: string;
  text: string | null;
  category: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  locationLabel: string | null;     // upserted server-side on sync
  correctionOfId: string | null;    // synced (server) ids only
  replyToId: string | null;
  reminderDueAt: string | null;     // ISO or null
  clientCapturedAt: string;         // ISO, set at capture
  attachments: QueuedAttachment[];
  status: "pending" | "syncing" | "error";
  error?: string;
  attempts: number;
}
export interface OfflineQueue {
  enqueue(item: QueuedRegistro): Promise<void>;
  forPartida(partidaId: string): Promise<QueuedRegistro[]>;
  all(): Promise<QueuedRegistro[]>;
  update(id: string, patch: Partial<QueuedRegistro>): Promise<void>;
  remove(id: string): Promise<void>;
  pendingCount(): Promise<number>;
}
```

- [ ] **Step 3: Write the failing test** (`offline-queue.test.ts`)

```ts
import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IndexedDbQueue } from "@/lib/offline/queue";
import type { QueuedRegistro } from "@/lib/offline/types";

function item(id: string, partidaId = "p1"): QueuedRegistro {
  return { id, partidaId, text: "x", category: null, gpsLat: null, gpsLng: null,
    locationLabel: null, correctionOfId: null, replyToId: null, reminderDueAt: null,
    clientCapturedAt: new Date().toISOString(),
    attachments: [{ blob: new Blob(["abc"], { type: "image/png" }), filename: "a.png", contentType: "image/png" }],
    status: "pending", attempts: 0 };
}

describe("IndexedDbQueue", () => {
  let q: IndexedDbQueue;
  beforeEach(async () => { indexedDB = new IDBFactory(); q = new IndexedDbQueue(`t-${Math.random()}`); });

  it("enqueues and reads back (blob round-trips)", async () => {
    await q.enqueue(item("a"));
    const all = await q.all();
    expect(all).toHaveLength(1);
    expect(await all[0].attachments[0].blob.text()).toBe("abc");
  });
  it("filters by partida", async () => {
    await q.enqueue(item("a", "p1")); await q.enqueue(item("b", "p2"));
    expect(await q.forPartida("p2")).toHaveLength(1);
  });
  it("updates and removes", async () => {
    await q.enqueue(item("a"));
    await q.update("a", { status: "error", error: "boom", attempts: 2 });
    expect((await q.all())[0].error).toBe("boom");
    await q.remove("a");
    expect(await q.all()).toHaveLength(0);
  });
  it("pendingCount counts pending + error (not syncing)", async () => {
    await q.enqueue(item("a")); await q.enqueue({ ...item("b"), status: "error" });
    await q.enqueue({ ...item("c"), status: "syncing" });
    expect(await q.pendingCount()).toBe(2);
  });
});
```
(Note: `IDBFactory` is global from `fake-indexeddb/auto`. Add `declare const IDBFactory: { new (): IDBFactory };` if TS complains, or import from `fake-indexeddb`.)

- [ ] **Step 4: Run — expect FAIL**.

- [ ] **Step 5: Implement `queue.ts`**

```ts
import { openDB, type IDBPDatabase } from "idb";
import type { OfflineQueue, QueuedRegistro } from "./types";

const STORE = "registros";

export class IndexedDbQueue implements OfflineQueue {
  private dbPromise: Promise<IDBPDatabase>;
  constructor(dbName = "raphl-offline") {
    this.dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("partidaId", "partidaId");
      },
    });
  }
  private async db() { return this.dbPromise; }
  async enqueue(item: QueuedRegistro) { await (await this.db()).put(STORE, item); }
  async all() { return (await (await this.db()).getAll(STORE)) as QueuedRegistro[]; }
  async forPartida(partidaId: string) {
    return (await (await this.db()).getAllFromIndex(STORE, "partidaId", partidaId)) as QueuedRegistro[];
  }
  async update(id: string, patch: Partial<QueuedRegistro>) {
    const db = await this.db();
    const cur = (await db.get(STORE, id)) as QueuedRegistro | undefined;
    if (cur) await db.put(STORE, { ...cur, ...patch });
  }
  async remove(id: string) { await (await this.db()).delete(STORE, id); }
  async pendingCount() {
    return (await this.all()).filter((i) => i.status !== "syncing").length;
  }
}

// Test/SSR-safe in-memory implementation.
export class InMemoryQueue implements OfflineQueue {
  private map = new Map<string, QueuedRegistro>();
  async enqueue(i: QueuedRegistro) { this.map.set(i.id, i); }
  async all() { return [...this.map.values()]; }
  async forPartida(p: string) { return [...this.map.values()].filter((i) => i.partidaId === p); }
  async update(id: string, patch: Partial<QueuedRegistro>) { const c = this.map.get(id); if (c) this.map.set(id, { ...c, ...patch }); }
  async remove(id: string) { this.map.delete(id); }
  async pendingCount() { return [...this.map.values()].filter((i) => i.status !== "syncing").length; }
}
```

- [ ] **Step 6: Run — expect PASS**, then commit.

```bash
git add src/lib/offline/types.ts src/lib/offline/queue.ts tests/offline-queue.test.ts package.json package-lock.json
git commit -m "feat(offline): IndexedDB capture queue (+ in-memory for tests)"
```

---

### Task 5: Sync engine + serializer

**Files:**
- Create: `src/lib/offline/serialize.ts`, `src/lib/offline/sync.ts`
- Test: `web/tests/offline-sync.test.ts`

- [ ] **Step 1: Write `serialize.ts`** (pure; build FormData from an item)

```ts
import type { QueuedRegistro } from "./types";

export function toFormData(item: QueuedRegistro): FormData {
  const fd = new FormData();
  fd.set("partidaId", item.partidaId);
  fd.set("idempotencyKey", item.id);
  fd.set("clientCapturedAt", item.clientCapturedAt);
  if (item.text) fd.set("text", item.text);
  if (item.category) fd.set("category", item.category);
  if (item.gpsLat != null) fd.set("gpsLat", String(item.gpsLat));
  if (item.gpsLng != null) fd.set("gpsLng", String(item.gpsLng));
  if (item.locationLabel) fd.set("location", item.locationLabel);
  if (item.correctionOfId) fd.set("correctionOfId", item.correctionOfId);
  if (item.replyToId) fd.set("replyToId", item.replyToId);
  if (item.reminderDueAt) fd.set("reminderDueAt", item.reminderDueAt);
  for (const a of item.attachments) fd.append("photos", a.blob, a.filename);
  return fd;
}
```

- [ ] **Step 2: Write the failing test** (`offline-sync.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";
import type { QueuedRegistro } from "@/lib/offline/types";

const item = (id: string): QueuedRegistro => ({ id, partidaId: "p", text: "x", category: null,
  gpsLat: null, gpsLng: null, locationLabel: null, correctionOfId: null, replyToId: null,
  reminderDueAt: null, clientCapturedAt: new Date().toISOString(), attachments: [], status: "pending", attempts: 0 });

const ok = () => Promise.resolve(new Response(JSON.stringify({ id: "srv" }), { status: 200 }));

describe("syncQueue", () => {
  let q: InMemoryQueue;
  beforeEach(() => { q = new InMemoryQueue(); });

  it("removes items on 2xx", async () => {
    await q.enqueue(item("a"));
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => true });
    expect(await q.all()).toHaveLength(0);
  });
  it("keeps + counts attempts on network error", async () => {
    await q.enqueue(item("a"));
    const fail = () => Promise.reject(new Error("offline"));
    await syncQueue({ queue: q, fetchFn: fail, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("pending"); expect(it0.attempts).toBe(1);
  });
  it("marks error (no retry) on 4xx", async () => {
    await q.enqueue(item("a"));
    const bad = () => Promise.resolve(new Response(JSON.stringify({ error: "malo" }), { status: 400 }));
    await syncQueue({ queue: q, fetchFn: bad, isOnline: () => true });
    expect((await q.all())[0].status).toBe("error");
  });
  it("marks 'sesión expirada' on 401", async () => {
    await q.enqueue(item("a"));
    const un = () => Promise.resolve(new Response("", { status: 401 }));
    await syncQueue({ queue: q, fetchFn: un, isOnline: () => true });
    expect((await q.all())[0].error).toMatch(/sesión/i);
  });
  it("does nothing when offline", async () => {
    await q.enqueue(item("a"));
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => false });
    expect(await q.all()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**.

- [ ] **Step 4: Implement `sync.ts`**

```ts
import type { OfflineQueue } from "./types";
import { toFormData } from "./serialize";

export interface SyncDeps {
  queue: OfflineQueue;
  fetchFn?: typeof fetch;
  isOnline?: () => boolean;
  endpoint?: string;
  onChange?: () => void;
}

let running = false;

export async function syncQueue(deps: SyncDeps): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const endpoint = deps.endpoint ?? "/api/offline/registros";
  if (!isOnline() || running) return;
  running = true;
  try {
    const items = (await deps.queue.all())
      .filter((i) => i.status !== "syncing")
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
    for (const item of items) {
      await deps.queue.update(item.id, { status: "syncing" });
      deps.onChange?.();
      try {
        const res = await fetchFn(endpoint, { method: "POST", body: toFormData(item) });
        if (res.ok) {
          await deps.queue.remove(item.id);
        } else if (res.status === 401) {
          await deps.queue.update(item.id, { status: "error", error: "Sesión expirada. Inicia sesión y reintenta." });
        } else {
          let msg = "No se pudo registrar.";
          try { msg = (await res.json())?.error ?? msg; } catch {}
          await deps.queue.update(item.id, { status: "error", error: msg });
        }
      } catch {
        await deps.queue.update(item.id, { status: "pending", attempts: item.attempts + 1 });
      }
      deps.onChange?.();
    }
  } finally {
    running = false;
  }
}
```

- [ ] **Step 5: Run — expect PASS** (5 tests), then commit.

```bash
git add src/lib/offline/serialize.ts src/lib/offline/sync.ts tests/offline-sync.test.ts
git commit -m "feat(offline): sync engine (drain/retry/backoff) + form serializer"
```

---

## Phase 2c — UX wiring (verify via tsc/lint + manual; no new unit tests)

### Task 6: Offline-first composer

**Files:**
- Modify: `src/components/log-composer.tsx`

- [ ] **Step 1: Replace the submit path**

- Add a module-level singleton: `const queue = new IndexedDbQueue();` (import from `@/lib/offline/queue`) — but guard for SSR: instantiate lazily inside an effect/handler (IndexedDB is browser-only). Use a `useRef` initialized on first client render, or a helper `getQueue()` that lazy-creates.
- Replace `useActionState(logRegistro, ...)` submission with an `onSubmit` handler that:
  1. `e.preventDefault()`; read the form fields (text, category, gps from `coords`, location, correction/reply/reminder hidden inputs) and the selected files.
  2. Build a `QueuedRegistro` with `id: crypto.randomUUID()`, `clientCapturedAt: new Date().toISOString()`, attachments mapped from the file inputs to `{ blob: file, filename: file.name, contentType: file.type }`.
  3. Client-side validation parity: reject empty (no text AND no files) with the existing error UX; check file caps client-side (mirror `SIZE_CAP`) for a fast message.
  4. `await getQueue().enqueue(item)`; reset the form; show an optimistic success ("guardado — se sincronizará").
  5. Fire `syncQueue({ queue: getQueue(), onChange })` (don't await) and `router.refresh()` after it resolves online.
- Keep GPS auto-capture, dictation, category/location datalist, correction/reply/reminder fields intact — only the submit target changes.
- Dispatch a `window` event (e.g. `window.dispatchEvent(new Event("raphl:queue-changed"))`) after enqueue + on sync change so the pending list + indicator refresh.

- [ ] **Step 2: Verify** `npx tsc --noEmit` + `npm run lint` clean; emoji scan clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/log-composer.tsx
git commit -m "feat(offline): offline-first composer — capture to queue, sync in background"
```

---

### Task 7: Pending list, sync indicator, provider

**Files:**
- Create: `src/components/pending-entries.tsx`, `src/components/sync-indicator.tsx`, `src/components/offline-provider.tsx`
- Modify: `src/app/app/partidas/[id]/page.tsx` (render `<PendingEntries partidaId/>` above the feed), `src/app/app/layout.tsx` (render `<OfflineProvider/>` + `<SyncIndicator/>` in `.appnav`)

- [ ] **Step 1: `offline-provider.tsx`** (client) — on mount: `syncQueue(...)`; add listeners for `window` `online` and `"raphl:queue-changed"` → `syncQueue(...)` + recompute `pendingCount()`; broadcast count via a `"raphl:queue-count"` event or a small context. Renders `null`.

- [ ] **Step 2: `sync-indicator.tsx`** (client) — subscribes to count; renders `t.offlineCapture.pending` with the number when > 0 (and a syncing state). NO emoji. Placed in `.appnav` before the language switcher.

- [ ] **Step 3: `pending-entries.tsx`** (client) — props `{ partidaId, t }`; on mount + on `"raphl:queue-changed"`, `getQueue().forPartida(partidaId)`; render each pending item card (text preview, attachment count, "pendiente"/"sincronizando"/error), with a **Reintentar** button on `error` items (sets status back to `pending` via `queue.update` then `syncQueue`). Mirror RecordCard visual styling but muted/dashed to signal "not yet sealed".

- [ ] **Step 4: Wire into pages** — partida page: `<PendingEntries partidaId={partida.id} t={t.offlineCapture} />` directly under the composer. Layout: `<OfflineProvider />` once + `<SyncIndicator t={t.offlineCapture} />` in the nav.

- [ ] **Step 5: Verify** tsc/lint/emoji clean. **Commit.**

```bash
git add src/components/pending-entries.tsx src/components/sync-indicator.tsx src/components/offline-provider.tsx src/app/app/partidas/[id]/page.tsx src/app/app/layout.tsx
git commit -m "feat(offline): pending list, sync indicator, and sync provider"
```

---

### Task 8: Capturado/Sellado display + i18n + final verification

**Files:**
- Modify: `src/components/record-card.tsx`, `src/i18n/dictionaries.ts`

- [ ] **Step 1: RecordCard** — when `r.clientCapturedAt` is present and differs from `r.serverCreatedAt` by more than ~1 min, show two lines: `t.offlineCapture.capturado` + on-site time and `t.offlineCapture.sellado` + server time. Otherwise keep the single current timestamp. (Add `clientCapturedAt` to whatever Registro type RecordCard receives; the partida page already selects full registros.)

- [ ] **Step 2: i18n** — add `offlineCapture` to BOTH `es` and `en` (shapes synced):
```
offlineCapture: {
  pending: "pendientes",            // EN: "pending"
  pendingOne: "pendiente de sincronizar",
  syncing: "Sincronizando…",
  retry: "Reintentar",
  savedOffline: "Guardado. Se sincronizará al recuperar conexión.",
  capturado: "Capturado",
  sellado: "Sellado",
  errorTitle: "No se pudo sincronizar",
}
```
(EN equivalents.)

- [ ] **Step 3: Full gate run**

Run: `npm test` (all pass incl. the 4 new suites), `npx tsc --noEmit` (0), `npm run lint` (clean), `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/` (none).

- [ ] **Step 4: Manual smoke (dev)** — restart dev (migration applied); with DevTools → Network → Offline: add a note + photo → it shows as *pending*; go back online → it syncs, the *pending* badge clears, and the entry appears in the sealed feed with `Capturado`/`Sellado`.

- [ ] **Step 5: Commit**

```bash
git add src/components/record-card.tsx src/i18n/dictionaries.ts
git commit -m "feat(offline): Capturado/Sellado display + offline i18n"
```

---

## Post-build
- Update `docs/superpowers/2026-06-05-raphl-status-and-feedback-tracker.md` (mark offline data capture shipped; note cold-start-offline + Background Sync as remaining).
- Restart the dev server (migration + prisma client regen) so the running tunnel session picks up the new model.

## Out of scope (future, per design §4)
- Offline app-shell for **cold-start-offline** (opening/refreshing with no signal).
- **Background Sync** (flush queue when the tab is closed).
- Creating new locations offline; replying to/correcting not-yet-synced entries.
