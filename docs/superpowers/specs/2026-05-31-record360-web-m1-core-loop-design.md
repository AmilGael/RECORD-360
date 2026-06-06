# RECORD 360 — Web App, Milestone 1: Core Black-Box Loop

**Date:** 2026-05-31
**Status:** Approved (design)
**Scope:** First milestone of the RECORD 360 web application — the end-to-end "immutable record" loop.

---

## 1. Goal

Prove the core value proposition end-to-end in a clickable, demoable web app:

> Log in → create Company / Project / Partida → log a Registro (text + photo) that is **append-only, server-timestamped, GPS-tagged, and hash-chained** → view the chronological Registro feed per Partida.

Explicitly **out of scope** for M1 (deferred to later milestones): executive/health dashboard, NLP risk detection, voice transcription, video, digital signatures, PDF export, the mobile app, and DB-level immutability lockdown.

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | UI + API (route handlers / server actions) in one app |
| Styling | **Tailwind CSS + shadcn/ui** | Carry the landing's design language (concrete paper, ink, safety-orange, `Archivo` + `Space Mono`) |
| Database | **PostgreSQL (Neon)** | Serverless, free tier, connection-string only — no local install. Cold-start latency on first query after idle is acceptable for dev/demo |
| ORM / migrations | **Prisma** | |
| Auth | **Auth.js (NextAuth v5), Credentials provider** | `role` on user; no external keys. Clerk is a later upgrade path |
| Photo storage | **Local disk in dev, behind a `Storage` interface** | Swap to S3/R2 later = one-file change |
| Testing | **Vitest** | Focused on hash-chain + append-only logic |

**Project layout:** new `web/` folder for the Next.js app. `landing/` and the PRD `README.md` stay as-is.

## 3. Data Model (Prisma schema)

```
User
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     // ADMIN | MANAGER | SUPERVISOR | RESIDENT
  companyId    String   // FK → Company (anchors "scoped to user's company")
  company      Company  @relation(...)
  createdAt    DateTime @default(now())

Company
  id        String    @id @default(cuid())
  name      String
  users     User[]
  projects  Project[]
  createdAt DateTime  @default(now())

Project
  id          String    @id @default(cuid())
  companyId   String    // FK → Company
  name        String
  description String?
  partidas    Partida[]
  createdAt   DateTime  @default(now())

Partida          // construction work item, e.g. "Vaciado losa N3"
  id          String     @id @default(cuid())
  projectId   String     // FK → Project
  name        String
  progressPct Int        @default(0)   // 0–100, latest known
  registros   Registro[]
  createdAt   DateTime   @default(now())

Registro         // APPEND-ONLY. Never updated or deleted.
  id              String   @id @default(cuid())
  partidaId       String   // FK → Partida
  type            RegistroType  // NOTE | PHOTO
  text            String?
  mediaUrl        String?
  progressPct     Int?           // optional progress update captured with this entry
  authorId        String   // FK → User
  serverCreatedAt DateTime       // server clock, NOT client
  gpsLat          Decimal? @db.Decimal(9,6)
  gpsLng          Decimal? @db.Decimal(9,6)
  prevHash        String         // hex; genesis sentinel for first in chain
  hash            String         // hex sha256
  correctionOfId  String?        // FK → Registro (this entry corrects an earlier one)
```

`enum Role { ADMIN MANAGER SUPERVISOR RESIDENT }`
`enum RegistroType { NOTE PHOTO }`

## 4. Immutability & Hash Chain (exact spec)

The hash chain is **per Partida** (bounded verification scope). Chain order is by `serverCreatedAt` ascending; ties broken by `id` ascending (the insert serializes these, see below).

### 4.1 Genesis sentinel

The first Registro in a Partida uses a fixed `prevHash`:

```
GENESIS_PREV_HASH = "0".repeat(64)   // 64 zero chars, matches sha256 hex length
```

### 4.2 Canonical payload

To prevent the app logic and tests from drifting, the hashed payload is a **canonical JSON string** with a **fixed field set, keys sorted ascending, nulls included, no whitespace**. Field serialization is pinned to avoid float/format ambiguity:

| Field | Serialized as |
|---|---|
| `type` | string enum value (`"NOTE"` / `"PHOTO"`) |
| `text` | string, or `null` |
| `mediaUrl` | string, or `null` |
| `progressPct` | integer, or `null` |
| `authorId` | string (cuid) |
| `gpsLat` | string via `toFixed(6)`, or `null` |
| `gpsLng` | string via `toFixed(6)`, or `null` |
| `serverCreatedAt` | ISO-8601 UTC with milliseconds, e.g. `"2026-05-31T08:42:17.123Z"` |

Canonical JSON example:
```json
{"authorId":"ckxa…","gpsLat":"18.486100","gpsLng":"-69.931200","mediaUrl":null,"progressPct":72,"serverCreatedAt":"2026-05-31T08:42:17.123Z","text":"Vaciado completado","type":"NOTE"}
```

### 4.3 Hash function

```
hash = sha256_hex( prevHash + canonicalPayload )
```
- `prevHash` is the hex string (genesis sentinel for the first entry, otherwise the previous Registro's `hash`).
- `canonicalPayload` is the UTF-8 canonical JSON string from 4.2.
- `serverCreatedAt` is part of the canonical payload, so it is **not** concatenated separately.

### 4.4 Append-only enforcement (M1 = app layer)

- No update or delete API/route exists for Registros.
- Corrections are a **new** Registro with `correctionOfId` pointing at the original; the original is never touched.
- Writes for a given Partida are **serialized** (transaction that reads the current chain tip, computes `prevHash`/`hash`, and inserts) so two concurrent logs can't fork the chain.
- DB-level lockdown (revoked UPDATE/DELETE grants + trigger) is documented as a later-milestone hardening step, not built in M1.

### 4.5 Verification helper

A `verifyChain(partidaId)` function recomputes the chain from genesis and returns the first divergence (if any). Used by tests and available for a later "verify" UI affordance.

## 5. Storage Interface

Defined now so the S3/R2 swap is genuinely one file:

```ts
interface Storage {
  put(file: { buffer: Buffer; filename: string; contentType: string }): Promise<{ url: string; key: string }>;
  get(key: string): Promise<NodeJS.ReadableStream>;
}
```

- **M1 implementation:** `LocalDiskStorage` — writes to `web/.uploads/`, returns a URL served by a Next.js route handler (`/api/media/[key]`). `.uploads/` is gitignored.
- **Later:** `S3Storage` implementing the same interface; only the bound implementation changes.

## 6. Screens

1. **Login** (`/login`) — email + password (Auth.js credentials).
2. **Dashboard** (`/`) — projects for the signed-in user's company.
3. **Project** (`/projects/[id]`) — list of partidas with progress.
4. **Partida** (`/partidas/[id]`) — chronological **Registro feed** + a **log composer**:
   - text + optional photo upload,
   - captures GPS via the browser Geolocation API at submit time (permission-gated; null if denied),
   - optional progress % update,
   - each feed item renders the sealed metadata (server timestamp, GPS, short hash) styled like the landing's record card.
5. **Admin** (`/admin`) — create Company / Project / Partida; create users with role.
   - **Invite flow (M1 reality):** since auth is credentials-only, "invite" = create a user with a **temporary password** shown to the admin. No email magic link / OAuth in M1.

### Role behavior (M1, kept simple)
- `ADMIN` / `MANAGER`: access Admin screens (create company/projects/partidas/users).
- `SUPERVISOR` / `RESIDENT`: can log Registros and view feeds, no Admin access.
- All data is scoped to the user's `companyId`.

## 7. Testing (Vitest)

Focused on the logic that must never silently break:

1. **Canonical payload** — same field set → identical canonical string; key order and null inclusion are stable.
2. **Genesis registro** — first entry in a Partida uses `GENESIS_PREV_HASH`; hash recomputes correctly. (Explicit edge-case test — this is where chain implementations go silently inconsistent.)
3. **Chain linkage** — second entry's `prevHash` equals first entry's `hash`; `verifyChain` passes for a valid chain.
4. **Tamper detection** — mutating a stored field makes `verifyChain` report divergence at that entry.
5. **Correction** — a correcting Registro is appended (original untouched), links via `correctionOfId`, and extends the chain.
6. A couple of API-route tests (auth required; append-only — no update/delete route exists).

## 8. Open Items / Later Milestones

- Executive/health dashboard, progress rollups, traffic-light status.
- NLP keyword risk flagging.
- Voice transcription (Whisper), video.
- Digital signatures (Viafirma/Avansi integration — see compliance research).
- DB-level immutability lockdown + external timestamp anchoring.
- S3/R2 storage implementation.
- Mobile (Expo) field app + offline sync.
