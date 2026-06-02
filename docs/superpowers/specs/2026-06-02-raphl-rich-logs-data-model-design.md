# Slice: Data-Model Foundation + Rich Logs

**Date:** 2026-06-02
**Branch context:** `feat/web-m1-core-loop` (M1 + slice A rename/theming + M1 hardening already on this branch)
**Status:** Approved design, ready for implementation plan

## Context

Raphl (formerly RECORD-360) is being grown into a "GitHub for Architects." That
full vision was decomposed into independent slices (A done: rename + theming;
M1 hardening done). This is the **first slice of the GitHub-paradigm program**:
the data-model foundation that the commit-history view, Issues tracker, and
change-orders all depend on. It adds three things to the existing per-partida
hash-chained ledger:

- **Categories** on log entries (`RegistroCategory`).
- **Multiple attachments** per entry (`Attachment[]`), replacing the single
  `mediaUrl`.
- **Reusable predefined locations** per project (`Location`, pick-or-create).

The existing ledger (`Registro` with `prevHash`/`hash`, `@@unique([partidaId,
prevHash])`, `retryOnConflict`) and its tamper-evidence hash are preserved and
extended. The hash canonical currently commits to `type` and `mediaUrl`
(`web/src/lib/registro/canonical.ts`); changing the registro shape therefore
changes the ledger format — handled explicitly below.

## Goals

- Model categories, multi-attachment, and reusable locations end-to-end
  (schema → backend → working composer/record-card UI).
- Keep — and strengthen — tamper-evidence: attachments become cryptographically
  committed via per-file SHA-256.
- Make future ledger-format changes non-breaking by stamping a `ledgerVersion`.

## Non-Goals (explicitly deferred)

- **VIDEO / PDF / AUDIO uploads** and presigned/large-file handling. The
  `AttachmentType` enum includes them for forward-compatibility, but only
  `IMAGE` is wired through the existing storage path this slice (Next.js server
  actions cap bodies at ~1 MB; large files need the separate presigned-upload
  slice).
- **Role overhaul** (`ALTA_GERENCIA`, etc.) — separate slice; `Role` is
  untouched here.
- **PullRequest / SpatialPin relations** — no speculative foreign keys; added
  when those slices are brainstormed.
- **10-way concurrency stress test** — belongs to the ledger-resiliency slice;
  `retryOnConflict` already covers the mechanism.
- **Preserving existing ledger history across the format change** — there is no
  seeded registro data (`seed.ts` creates only the admin user), so this is a
  clean break with a dev DB reset, not a dual-format migration.

## Design Decisions (settled in brainstorming)

- **Scope:** schema + backend + working UI. No PR/SpatialPin FKs.
- **Ledger format:** clean break + a `ledgerVersion Int @default(2)` stamp; new
  canonical (v2); dev data reset; no dual-format verification code now.
- **Category:** optional (nullable) — low friction for field capture.
- **Locations:** a `Location` model per project; composer offers existing
  locations and lets the user type a new one (saved for reuse); registro has
  optional `locationId`.
- **Attachments:** `Attachment` model with the full `fileType` enum; this slice
  wires multi-**IMAGE** upload only.
- **Hash commits to `locationId`** (stable across label edits), not the label
  text.
- **Hash commits to a per-file SHA-256** of attachment content (genuine
  tamper-evidence; storage keys are random UUIDs, not content-addressed, so the
  URL alone would not seal the bytes).

## Schema (`web/prisma/schema.prisma`)

```prisma
enum RegistroCategory { MATERIALES PROCESOS EVENTUALIDADES OBSERVACIONES COSTOS PERSONAL }
enum AttachmentType   { IMAGE VIDEO PDF AUDIO }

model Location {
  id        String     @id @default(cuid())
  projectId String
  project   Project    @relation(fields: [projectId], references: [id])
  label     String
  registros Registro[]
  createdAt DateTime   @default(now())
  @@unique([projectId, label])
}

model Attachment {
  id         String         @id @default(cuid())
  registroId String
  registro   Registro       @relation(fields: [registroId], references: [id])
  url        String
  sha256     String
  fileType   AttachmentType
  @@index([registroId])
}
```

`Registro` changes: remove `type RegistroType` and `mediaUrl String?` (and remove
the now-unused `RegistroType` enum). Add:

```prisma
  category      RegistroCategory?
  locationId    String?
  location      Location?         @relation(fields: [locationId], references: [id])
  ledgerVersion Int               @default(2)
  attachments   Attachment[]
```

Everything else on `Registro` is unchanged (`partidaId`, `text`, `progressPct`,
`authorId`, `serverCreatedAt`, `gpsLat`, `gpsLng`, `prevHash`, `hash`,
`correctionOfId`, `@@unique([partidaId, prevHash])`, `@@index([partidaId,
serverCreatedAt])`). `Project` gains `locations Location[]`.

## Canonical v2 (`web/src/lib/registro/canonical.ts`)

`RegistroPayload` becomes the v2 shape. `canonicalPayload` produces a
deterministic JSON string over sorted top-level keys:

- `attachments`: array of `{ fileType, sha256 }`, **sorted by `sha256`** (so
  attachment order never affects the hash)
- `authorId`
- `category`: the enum string value, or `null`
- `gpsLat` / `gpsLng`: `toFixed(6)` or `null`
- `ledgerVersion`: `2`
- `locationId`: string or `null`
- `progressPct`: `Math.round(...)` or `null`
- `serverCreatedAt`: `.toISOString()`
- `text`: string or `null`

`computeHash(prevHash, payload)` is unchanged (`sha256(prevHash + canonical)`).
`verifyChain` reads the v2 fields, asserts `ledgerVersion === 2`, and recomputes
with the v2 canonical. (A future v3 branches on `ledgerVersion` here.) `map.ts`
(`toStored`) maps the new fields.

## Append flow

- **`prepareAttachments(files: File[], storage): Promise<{ fileType: "IMAGE"; url: string; sha256: string }[]>`**
  (`web/src/lib/registro/upload.ts`, replacing `prepareMedia`): for each file,
  validate against the image MIME allowlist (`extensionForType`), compute
  SHA-256 of the bytes, upload via `storage.put`, collect `{fileType, url,
  sha256}`. Disallowed type → reject before storing (specific message). Storage
  failure → generic error. No files → `[]`.
- **`parseCategory(raw): RegistroCategory | null`** (`validate.ts`): empty/missing
  → null; a valid enum member → it; anything else throws.
- **Action `logRegistro`** (`web/src/app/actions/registro.ts`): auth + tenant
  guard (unchanged) → `parseProgressPct` → `parseCategory` →
  `prepareAttachments(formData.getAll("photos"), storage)` (upload before the
  transaction) → resolve location: if a non-empty `location` label is provided,
  `prisma.location.upsert` on `@@unique([projectId,label])` → `locationId`
  (empty → null) → `appendRegistro({ partidaId, authorId, category, text,
  progressPct, gpsLat, gpsLng, locationId, attachments })` → `revalidatePath`.
- **`appendRegistro`** (`append.ts`, still wrapped in `retryOnConflict`): read
  tip → compute v2 hash → `tx.registro.create` with **nested `attachments`
  create** and `ledgerVersion: 2` → update partida `progressPct` when present.
  One transaction.

Resolving the location before the transaction can, on a failed/retried append,
leave an unused `Location` row — acceptable, since locations are reusable
reference data.

## UI

- **`LogComposer`** (`web/src/components/log-composer.tsx`): add an optional
  category `<select>` (blank + 6 i18n labels), a location `<input list="...">`
  backed by a `<datalist>` of the project's existing location labels (sends the
  label string under `name="location"`), and `multiple` on the file input
  (`name="photos"`, image accept). Existing text / progress / GPS-pending /
  graceful-error behavior is preserved. New prop: the project's location labels.
- **`RecordCard`** (`web/src/components/record-card.tsx`): render a category
  badge and location label when present; render **all** attachments as an image
  grid (replacing the single `mediaUrl` `<img>`); drop the raw `type` display;
  keep the localized timestamp, GPS, and hash line. New prop shape includes
  `attachments` and `location`.
- **Partida page** (`web/src/app/app/partidas/[id]/page.tsx`): include
  `attachments` and `location` on registros; fetch the project's `locations` and
  pass their labels to the composer.
- **i18n** (`web/src/i18n/dictionaries.ts`): ES + EN labels for the six
  categories, a "no category" / placeholder option, and a location input
  placeholder.

## Migration

One Prisma migration via `prisma migrate dev` (new enums + `Location` +
`Attachment`, altered `Registro`, dropped `RegistroType`, `Project.locations`).
Clean break: the dev DB is reset (`prisma migrate reset`, which re-applies
migrations and reseeds the admin user). No backfill of pre-existing rows.

## Testing (TDD)

Pure units, test-first:

- **canonical v2:** deterministic string + sorted key order; attachment digest
  is order-independent (same hash regardless of attachment array order); null
  handling for category/location/gps/progress.
- **`verifyChain` v2:** a valid v2 chain passes; mutating a category, a
  `locationId`, or an attachment `sha256` breaks it at the right record.
- **`parseCategory`:** valid enum → value; empty → null; invalid → throws.
- **`prepareAttachments`:** no files → `[]`; multiple allowed images → list with
  correct `sha256`/`fileType`/`url` (injected fake `Storage`); a disallowed type
  rejects before storage is touched; a storage failure maps to a generic error.

DB integration (extends `web/tests/append.test.ts`): append a registro with a
category, a resolved location, and 2 attachments → the row + 2 `Attachment` rows
are created and `verifyChain` passes over the resulting chain.

## Verification

`npm run test` (all suites green), `npm run lint`, `npm run build`, and a manual
pass: create a categorized, located, multi-image registro in the composer (ES
and EN) and confirm it renders in the record card with the category badge,
location, and image grid.
