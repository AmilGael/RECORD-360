# Offline Data Capture — Design (PWA phase 2)

**Date:** 2026-06-05 · **Branch:** `feat/web-m1-core-loop` · **App:** `web/`

**Goal:** Let field users capture Registros (notes + photos/video/audio + GPS) with no connectivity, queued locally and synced to the immutable ledger when the connection returns — without compromising the server-authoritative hash chain.

**Locked decisions (from brainstorming):**
1. **Scope:** notes **and** attachments (blobs) capture offline.
2. **Model:** **offline-first** — every entry is written to a local queue first, then synced (online or not).
3. **Time integrity:** the hash payload is **unchanged** (still seals content + server-received time). On-site capture time (`clientCapturedAt`) is stored + displayed as metadata, not hash-committed.

---

## 1. Backbone principle

The hash chain is **server-authoritative**: `appendRegistro` computes each entry's hash against the current chain head at insert time; order = server insertion order. Offline entries therefore **cannot** carry a client-chosen chain position. Instead:

- The client captures **content** locally (text, files, GPS, `clientCapturedAt`, a client-generated UUID).
- On reconnect, the client POSTs each entry; the **server assigns the chain position** at sync time (appends to the then-current head) and dedupes by the UUID (idempotency key).
- Each Registro records both `clientCapturedAt` (when written on-site) and `serverCreatedAt` (when it entered the ledger). The seal covers content + server time; capture time is shown alongside.

No client-side crypto, no client chain → the immutable contract is untouched. This directly realizes decision #3.

---

## 2. Components (units with clear boundaries)

### 2.1 Local queue — `src/lib/offline/queue.ts` (+ `types.ts`)
IndexedDB-backed store of pending entries (IndexedDB stores `Blob`s natively — ideal for photos/video/audio). Hidden behind an interface so the sync engine is testable without a browser.

```ts
// types.ts
export interface QueuedAttachment { blob: Blob; filename: string; contentType: string; }
export interface QueuedRegistro {
  id: string;                 // client UUID == idempotencyKey
  partidaId: string;
  text: string | null;
  category: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  locationId: string | null;  // must be an already-synced location id
  correctionOfId: string | null; // only synced (server) ids — see §4
  replyToId: string | null;       // only synced (server) ids — see §4
  clientCapturedAt: string;   // ISO 8601, set at capture
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
Two implementations: `IndexedDbQueue` (browser) and `InMemoryQueue` (tests). Real impl tested with `fake-indexeddb`.

### 2.2 Sync engine — `src/lib/offline/sync.ts`
Pure-ish orchestrator; dependencies (queue, `fetch`, online-check, onProgress) injected for testing.

- `drain()`: for each `pending`/`error` item (oldest first): mark `syncing` → POST to the sync endpoint (multipart with files) → on **2xx**: `remove`; on **network error**: leave, `attempts++`, status back to `pending` (retried later, capped backoff); on **401**: mark `error: "sesión expirada"`; on **4xx validation**: mark `error` (no infinite retry).
- Sequential processing (simple, predictable). Idempotency key = item `id`, so retries after an unobserved success are safe.
- Triggers (client): on app load, on `window` `online` event, and immediately after each `enqueue` when online.

### 2.3 Sync endpoint — `src/app/api/offline/registros/route.ts` (POST)
One entry per request (with its files), `multipart/form-data`.
- **Auth + tenancy:** session required (401); partida scoped via `projectAccessWhere` (404 if no access) — same guarantees as `logRegistro`.
- **Idempotency:** look up `Registro` by `idempotencyKey`; if it exists → return `200 {id}` **without** creating a duplicate. Else → `prepareAttachments(files, storage)` + `appendRegistro({..., idempotencyKey, clientCapturedAt})`.
- **Validation:** reuse the existing MIME allowlist + per-type size caps (`lib/registro/upload.ts`); reject oversize/unsupported with a 4xx the client surfaces.
- Returns the created/existing registro id.

### 2.4 Schema (additive migration `add_offline_capture`)
On `Registro`:
- `idempotencyKey String? @unique` — dedupe key. **Excluded from `computeHash`** (operational pointer, per the LEDGER CONTRACT — same class as `correctionOfId`).
- `clientCapturedAt DateTime?` — on-site capture time. **Excluded from `computeHash`** (decision #3; metadata only).

`appendRegistro`/`appendRegistroTx` gain optional `idempotencyKey` + `clientCapturedAt`, stored but kept out of the hash payload. The LEDGER CONTRACT comment is extended to name them.

### 2.5 UI
- **Composer (`log-composer.tsx`)** becomes offline-first: `save()` writes to the queue (always), renders the entry optimistically as *pending*, and kicks a sync. Keeps the existing structured-error UX for client-side validation. Online feels identical (enqueue → sync → `router.refresh()` in well under a second).
- **`pending-entries.tsx`** (client): renders this partida's queued items above the server feed with a "pendiente de sincronizar" badge; shows `error` state + a **Reintentar** button.
- **`sync-indicator.tsx`** (client): a small nav element — "N pendientes" with a syncing state — reading `pendingCount()`.
- **`offline-provider.tsx`** (client, mounted in app layout): kicks `drain()` on load + `online` event; exposes pending count to the indicator.
- **`record-card.tsx`**: when `clientCapturedAt` is present and differs from `serverCreatedAt`, show `Capturado: <on-site>` and `Sellado: <server>`.
- **i18n**: `offlineCapture` block (pending, syncing, retry, error states, capturado/sellado labels).

---

## 3. Data flow

```
capture (online OR offline):
  composer.save()
    → queue.enqueue({id: uuid, ...content, clientCapturedAt: now})
    → optimistic "pending" row
    → sync.kick()

sync.drain() (when online):
  for each pending item:
    POST /api/offline/registros (multipart: fields + files + idempotencyKey)
      server: find Registro by idempotencyKey?
                 yes → 200 {id}        (dedupe)
                 no  → prepareAttachments → appendRegistro(...) → 200 {id}
    → queue.remove(item) → router.refresh()

window 'online' / app load → sync.drain()
```

---

## 4. Edge cases & v1 boundaries (call-outs)

- **Cold-start-offline boundary (important):** capture works while the **app is already loaded** (the realistic "logging as I walk the site, signal drops" case). Opening/refreshing the app with *no* signal currently shows the offline fallback page, because RSC pages aren't cached as a full offline app shell. Serving whole pages offline (SPA shell / cached HTML) is **phase 2b**, out of this design. **v1 assumption: the tab stays open on-site.**
- **Replies/corrections** can target only **already-synced** entries (server ids). Those affordances live on server-rendered cards, so pending entries simply don't offer them. No local-id remapping needed in v1.
- **Locations:** offline you can pick only from the already-loaded location list; creating new locations offline is out of scope.
- **Attachment caps:** enforced client-side before enqueue (fail fast) and again server-side at sync (authoritative).
- **IndexedDB quota:** large videos can fill local storage; surface quota errors gracefully ("almacenamiento del dispositivo lleno"). Documented limitation.
- **Session expiry by sync time:** endpoint returns 401 → items marked `error: "sesión expirada"`; after re-login, **Reintentar** flushes them (idempotency prevents dupes).
- **Cross-device dupes:** client UUID is globally unique → no collisions; idempotency key dedupes retries.
- **Background Sync (closed tab):** flushing the queue when the tab is closed via the SW `sync` event is a **later enhancement** (phase 2c), noted not built.

---

## 5. Testing strategy (TDD)

- `offline-queue.test.ts` — `IndexedDbQueue` against `fake-indexeddb`: enqueue/forPartida/update/remove/pendingCount; blobs round-trip.
- `offline-sync.test.ts` — injected queue + mocked `fetch`: success removes item; network error keeps + increments attempts; 401 → error "sesión expirada"; 4xx → error (no retry storm); idempotent re-drain after unobserved success doesn't duplicate.
- `offline-registros-route.test.ts` — endpoint: 401 unauth; 404 cross-tenant; happy path creates a Registro with `idempotencyKey` + `clientCapturedAt`; **duplicate idempotencyKey returns existing id and count stays 1**; oversize/disallowed file rejected.
- `append-offline-fields.test.ts` — `appendRegistro` stores the new fields but the **hash is identical** to a baseline computed without them (proves they're out of the payload), and `verifyChain` still passes.

---

## 6. Files

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (+ migration `add_offline_capture`) | `Registro.idempotencyKey?` (unique), `Registro.clientCapturedAt?` |
| `src/lib/registro/append.ts` | accept + store the two fields; keep out of `computeHash`; update LEDGER CONTRACT |
| `src/lib/offline/types.ts` | `QueuedRegistro`, `QueuedAttachment`, `OfflineQueue` |
| `src/lib/offline/queue.ts` | `IndexedDbQueue` + `InMemoryQueue` |
| `src/lib/offline/sync.ts` | sync engine (drain/retry/backoff, injected deps) |
| `src/app/api/offline/registros/route.ts` | POST sync endpoint (multipart, idempotent, scoped) |
| `src/components/log-composer.tsx` | offline-first capture (enqueue → kick sync) |
| `src/components/pending-entries.tsx` | per-partida pending list + retry/error |
| `src/components/sync-indicator.tsx` | global pending count / syncing state (nav) |
| `src/components/offline-provider.tsx` | kick sync on load + `online`; provide count |
| `src/components/record-card.tsx` | show Capturado vs Sellado |
| `src/i18n/dictionaries.ts` | `offlineCapture` strings (ES/EN) |

## 7. New dependencies
- `idb` (tiny IndexedDB helper) — runtime.
- `fake-indexeddb` — dev (tests).

## 8. Build phasing
- **2a (server):** schema + `appendRegistro` extension + sync endpoint + their tests. Fully verifiable headless.
- **2b (client core):** queue + sync engine + tests.
- **2c (UX):** composer offline-first + pending UI + sync indicator + provider + RecordCard display + i18n.
- **Future (not this build):** offline app-shell for cold-start-offline; Background Sync for closed-tab flush.

---

## 9. What this does NOT change
- The immutable hash chain (server-authoritative; payload unchanged).
- Online behavior (still sub-second; same structured-error UX).
- Tenant/role scoping (the endpoint reuses `projectAccessWhere` + caps + MIME allowlist).
