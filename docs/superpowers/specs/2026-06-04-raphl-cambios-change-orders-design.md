# Slice: Cambios — Change Orders as Pull Requests

**Date:** 2026-06-04
**Branch context:** `feat/web-m1-core-loop` (M1 + slice A + hardening + rich-logs + segments-IA + security hardening + vocab canon + emoji purge already on this branch)
**Status:** Design pending user review

## Context

Raphl is "version control for construction": every Obra is a repository, every
field log a signed commit (Registro), with a per-partida append-only SHA-256
hash chain. This slice builds the **Cambios** tab — the project workspace's
third tab, currently a disabled `Próx` stub — as the **pull-request equivalent**:
a digital workflow to request and approve extra work / design changes (PRD F4.3).
It is the feature closest to real money (faster billing cycles) and the first to
consume the `--state-merged` / `--state-blocked` color tokens defined but unused
since the segments slice.

Vocabulary is already locked (commit `19a3c68`) and the reusable monochrome
line-icon set already exists (`web/src/components/icons.tsx`, commit `4ef0480`).
Principle throughout: **GitHub structure, construction skin** — no dev jargon, no
emoji.

## Goals

- A **`Solicitud de cambio`** (change request) is **project-level** and references
  one or more affected partidas — like a PR is repo-level but touches files.
- Two-step, manager-gated flow: **Abierta** (opened by Residente/Supervisor) →
  **Integrada** / **Rechazada** (by Gerente/Admin). No one resolves their own
  request; ADMIN overrides.
- On **Integrada**, the change is sealed into the immutable record two ways in one
  transaction: (1) the ChangeRequest gets its own content **seal** (hash); (2) a
  linked marker **Registro** is appended to each affected partida's chain.
- Two screens: a PR-style **Cambios list** and a **change-request detail/review**
  page, in the warm-editorial + line-icon visual language.

## Non-Goals (deferred)

- **Comments / conversation thread** on a change request — later slice.
- **Pre-authorization** (a third `Pre-autorizada` state with a Supervisor gate) —
  the PRD-literal 3-step. The 2-step ships first; the extra state can be added
  later without reworking the seal mechanic.
- **Digital signatures (F4.4)** on integration — needs Ley 126-02 research + an
  external signer. Separate milestone.
- **PDF export / Releases (F4.5)** of a sealed change order — its own slice; the
  seal designed here is the foundation.
- **Editing a change request after Abierta** beyond resolve/reject — out of scope.
- Reassigning affected partidas after creation.

## Design Decisions (settled in brainstorming)

- **Anchoring:** project-level, references partidas (chosen over partida-level).
  URL: `/app/projects/[id]?tab=cambios` (list) and
  `/app/projects/[id]/cambios/[crId]` (detail).
- **Integrada mechanic:** seal-the-artifact **and** linked marker in each partida
  (chosen over append-only or seal-only), executed atomically.
- **Flow/roles:** two-step, manager-gated (chosen over 3-step and flat authority).
- **Field set (locked):** `code` (auto per-project, `SC-NNN`), `title`,
  `description`, affected `partidas` (1+), `costImpact` (RD$), `daysImpact`,
  evidence attachments, requester + server timestamp + GPS, `status`; on
  resolution: resolver + resolvedAt + `seal`.
- **State enum:** `OPEN` / `INTEGRATED` / `REJECTED` (vocab `Abierta` /
  `Integrada` / `Rechazada` already in `dictionaries.ts` `changes.states`).
- **No emoji:** all iconography via `components/icons.tsx`.

## Schema (additive migration — no reset)

```prisma
enum ChangeStatus {
  OPEN
  INTEGRATED
  REJECTED
}

model ChangeRequest {
  id           String        @id @default(cuid())
  projectId    String
  project      Project       @relation(fields: [projectId], references: [id])
  code         String        // "SC-014", per-project sequence
  title        String
  description  String?
  costImpact   Decimal?      @db.Decimal(12, 2)
  daysImpact   Int?
  status       ChangeStatus  @default(OPEN)
  authorId     String        // requester (no User relation, consistent with Registro)
  gpsLat       Decimal?      @db.Decimal(9, 6)
  gpsLng       Decimal?      @db.Decimal(9, 6)
  resolvedById String?       // who integrated/rejected
  resolvedAt   DateTime?
  seal         String?       // content hash, set on INTEGRATED
  createdAt    DateTime      @default(now())

  partidas     ChangeRequestPartida[]
  attachments  ChangeAttachment[]
  markers      Registro[]    @relation("RegistroChange")

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
  id              String        @id @default(cuid())
  changeRequestId String
  changeRequest   ChangeRequest @relation(fields: [changeRequestId], references: [id], onDelete: Cascade)
  url             String
  sha256          String
  fileType        AttachmentType
  @@index([changeRequestId])
}
```

`Registro` gains a nullable link so a marker entry points back to the change it
records (the marker is a normal entry in the hash chain; the link is metadata,
NOT hash-committed):
```prisma
  changeRequestId String?
  changeRequest   ChangeRequest? @relation("RegistroChange", fields: [changeRequestId], references: [id], onDelete: SetNull)
```
`Project` gains `changeRequests ChangeRequest[]`; `Partida` gains
`changeRequests ChangeRequestPartida[]`. Purely additive — no reset.

**Evidence storage decision:** a dedicated `ChangeAttachment` (mirroring
`Attachment`) rather than making `Attachment.registroId` nullable — keeps the
existing media-auth query and the Registro hash unchanged. See media-auth note
below.

## Backend

- **`createChangeRequest`** server action (`web/src/app/actions/cambios.ts`):
  tenant-scoped (project belongs to caller's company); role gate = any signed-in
  member may open (Residente+). Validates title (required, trimmed), description,
  `costImpact` (parse to Decimal, allow negative), `daysImpact` (int), at least
  one affected partida (all must belong to the project). Generates `code` as
  `SC-${count_in_project + 1}` inside the transaction. Stores evidence via the
  existing `prepareAttachments`-style pipeline writing `ChangeAttachment` rows.
  Captures optional GPS. Status defaults `OPEN`.
- **`resolveChangeRequest(crId, action: "INTEGRATE" | "REJECT")`** server action:
  role gate = **MANAGER or ADMIN only**; reject if `resolvedById === authorId`
  (no self-approval); reject if not currently `OPEN`. In one `prisma.$transaction`
  + `retryOnConflict`:
  - **REJECT:** set `status = REJECTED`, `resolvedById`, `resolvedAt`. No seal, no
    markers.
  - **INTEGRATE:** compute `seal = computeChangeSeal(cr)` (canonical hash over the
    frozen content: code, title, description, costImpact, daysImpact, partida ids,
    authorId, resolvedById, resolvedAt); set `status = INTEGRATED`, `resolvedById`,
    `resolvedAt`, `seal`; then for **each** affected partida call the existing
    `appendRegistro` to append a marker entry (category null, text e.g.
    `"Cambio ${code} integrado · +RD$48,000 · +3 días"`, `changeRequestId = cr.id`,
    no progress change), so each partida's chain advances and `verifyChain` stays
    valid. This requires extending `AppendInput` with an optional `changeRequestId`
    threaded into the `registro.create` data (the field is metadata, not part of
    `computeHash`).
- **`computeChangeSeal`** (`web/src/lib/cambios/seal.ts`): reuse the canonical-JSON
  + SHA-256 approach from `web/src/lib/registro/hash.ts` (extract a shared
  `sha256Canonical` helper if clean; otherwise mirror it). Pure, unit-tested.
- **Media auth:** `ChangeAttachment` evidence is served by the same
  `/api/media/[key]` route. Extend its authorization query to match **either**
  an `Attachment` via `registro → partida → project.companyId` **or** a
  `ChangeAttachment` via `changeRequest → project.companyId`. (Today it only
  checks the Attachment path; CR evidence would 404 without this.)

## Screens

`web/src/app/app/projects/[id]/page.tsx` — the `🔀`→Branch-icon Cambios tab
becomes an active `<Link href="?tab=cambios">` (remove its `is-off`/`Próx` stub).
Server-driven via search params, consistent with the segments slice.

- **Cambios list** (`?tab=cambios`): filter row (Abiertas / Integradas /
  Rechazadas counts with green/purple/red status dots), `+ Nueva solicitud`
  button (opens the create form — any member), and rows showing status dot, code +
  title, affected partidas, requester, relative time, short hash/seal, and the
  `costImpact · daysImpact` on the right. Empty state via `changes.empty`.
- **Create form:** title, description, affected-partidas multi-select (from the
  project's partidas), costImpact, daysImpact, evidence file input (reuses the
  composer's accept list), optional GPS capture.
- **Detail / review** (`/app/projects/[id]/cambios/[crId]`, tenant-scoped
  `findFirstOrThrow`): dark header (code + status badge), fields (título,
  descripción, partidas afectadas as chips, Impacto: Costo + Tiempo boxes,
  evidencia thumbnails, solicitante + timestamp + GPS). For MANAGER/ADMIN viewing
  an `OPEN` request (and not the author): `Integrar al expediente` / `Rechazar`
  actions. For `INTEGRATED`: show resolver + resolvedAt + seal. All icons from
  `components/icons.tsx`; no emoji.

## i18n

`changes.*` already seeded (`item`, `itemPlural`, `new`, `empty`, `review`,
`integrate`, `reject`, `states.{OPEN,INTEGRATED,REJECTED}`). Add as needed:
`fieldTitle`, `fieldDescription`, `fieldPartidas`, `impactCost`, `impactTime`,
`evidence`, `requester`, `resolvedBy`, `seal`, `integrateCta`
(`Integrar al expediente`), `selfApprove` error, list filter labels. Keep ES/EN
shapes in sync (the `Dict` type derives from `es`).

## Aesthetic — `globals.css`

Reuse existing tokens. Status dots: `--state-active` (Abierta, green),
`--state-merged` (Integrada, purple), `--state-blocked` (Rechazada, red). Add
`.cr-list` / `.cr-row` / `.cr-detail` / `.impact-box` classes mirroring the
approved mockup (`.superpowers/brainstorm/.../cambios-screens-v2.html`). Mono
telemetry for code/seal/timestamps; Fraunces for the title.

## Testing

TDD (pure units, test-first):
- **`computeChangeSeal`**: deterministic for fixed input; changes when any sealed
  field changes; stable field ordering.
- **`code` generation**: `SC-1` for the first request in a project; increments.
- **cost/days parsing**: blanks → null; negatives allowed; non-numeric rejected.

DB integration (extend the suite):
- **`createChangeRequest`**: persists with `OPEN`, links affected partidas,
  cross-tenant project rejected.
- **`resolveChangeRequest` INTEGRATE**: sets seal + resolver, appends exactly one
  marker Registro per affected partida with `changeRequestId` set, and each
  affected partida's chain still passes `verifyChain`.
- **REJECT**: sets `REJECTED`, no seal, no markers.
- **Guards**: non-manager cannot resolve; author cannot resolve own request;
  resolving a non-`OPEN` request fails.
- **Media auth**: a CR evidence key is served to a same-company manager and 404s
  cross-company (extends the existing media-route test).
- Cleanup deletes markers/attachments → change requests → (existing teardown).

UI verified via `tsc` + `npm run build` + a manual pass.

## Verification

`npm test` (all green), `npm run lint`, `npm run build`, and a manual pass:
open a change request against two partidas, confirm it appears Abierta in the
list with cost/time; as a Manager integrate it, confirm the seal appears, both
affected partidas show a linked "Cambio SC-N integrado" entry in their bitácora,
and chain verification still passes; confirm a Resident cannot integrate and an
author cannot self-approve; confirm ES⇄EN translate and no emoji anywhere.
