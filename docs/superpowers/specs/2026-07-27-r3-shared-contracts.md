# R3 Remediation — Shared Contracts (Lead Agent)

Branch: `feat/architect-feedback-r3` (off `feat/impeccable-design-pass`).
Baseline at ec5aa91: 359 tests green, lint clean, build green (per prior ledger), `tsc` has ONE pre-existing error (`tests/partida-facets.test.ts:38`, SegmentGroup<never> inference — predates this work, vitest/build unaffected).

All agents MUST follow these contracts. Do not invent parallel enums, event names, or state machines.

## 1. Terminology (user-visible)

| Concept | ES | EN |
|---|---|---|
| ChangeRequest domain (umbrella) | Solicitud | Request |
| RequestKind.CHANGE | Solicitud de cambio | Change request |
| RequestKind.ALERT | Alerta | Alert |
| Severity IMPORTANT | Importante (amarillo) | Important (yellow) |
| Severity CRITICAL | Crítica (rojo) | Critical (red) |
| Operational pending queue | Pendientes por resolver | Open items |
| Offline capture queue | Pendientes de sincronización | Pending synchronization |
| Conclude partida | Concluir partida | Complete work item |
| Reopen partida | Reabrir partida | Reopen work item |
| Close block | Cerrar bloque | Close block |
| Reopen block | Reabrir bloque | Reopen block |
| Archive user | Archivar usuario | Archive user |

Routes stay at `/cambios` (do NOT break URLs). Only display strings change. The "Cambios" tab label becomes "Solicitudes"/"Requests".

## 2. Schema additions (lead-owned; migration `r3_lifecycle_requests`)

```prisma
enum RequestKind { CHANGE ALERT }
enum RequestSeverity { IMPORTANT CRITICAL }
enum InformeArchetype { OWNER SENIOR_MANAGEMENT PERSONAL_FEEDBACK }
enum NotificationSeverity { SUCCESS IMPORTANT CRITICAL }

Project:  ownerName String?           // WS4A: least-complex model = free text. Description unchanged, NOT an address field.
Segment:  closedAt DateTime?  closedById String?
Partida:  completedAt DateTime?  completedById String?  priorProgressPct Int?  // progress before conclude, for reopen restore
ChangeRequest: kind RequestKind @default(CHANGE)  severity RequestSeverity @default(IMPORTANT)
               // DB default IMPORTANT backfills existing rows; the FORM requires an explicit choice (no preselect).
Informe:  archetype InformeArchetype?  // nullable: legacy informes show a generic label; new writes always set it.
Notification: severity NotificationSeverity?  projectId String?  eventKey String?  // eventKey = canonical typed event; `type` kept for legacy rows
              @@index([userId, type]) stays; add @@index([companyId, projectId])
```

No new tables → no new RLS statements needed; migration is CREATE TYPE + ALTER TABLE ADD COLUMN only (all nullable or defaulted → safe, backward compatible, reversible by dropping columns/types).

## 3. Notification event policy (lead-owned module: `web/src/lib/notifications/events.ts`)

Single typed helper `notifyEvent(ev)` wraps `createNotifications`. Canonical event keys (stored in `eventKey`; `type` mirrors it for new rows):

- `block.created` · `block.closed` · `block.reopened`
- `partida.created` · `partida.completed` · `partida.reopened` · `partida.deleted` (existing permanent-deletion flows adopt on touch)
- `request.created` (kind CHANGE) · `alert.created` (kind ALERT) · `request.resolved` · `request.rejected`
- `reminder.resolved`
- `user.archived` (one per removed project assignment, to that project's active ADMIN/MANAGER stakeholders + assignment peers per WS2B)

Legacy rows carry `cambio.created` / `cambio.resolved` in `type`; the notifications UI must treat them as `request.created`/`request.resolved` aliases when filtering.

Severity mapping: SUCCESS (green) = completed/resolved/reopened-info events; IMPORTANT/CRITICAL = mirrors RequestSeverity on `request.created`/`alert.created`; null = informational (created events without severity). Text labels ALWAYS accompany color.

Recipient policy (shared): company-scoped; exclude the actor; exclude `disabledAt != null`; ADMIN+MANAGER always; plus project-assigned SUPERVISORs for project events. Dedupe recipients per event. Never notify across companyId.

## 4. Lifecycle semantics

**Partida:** `completedAt == null` = open. Conclude: authorized (structure access), not deleted, project not archived, idempotent (already-concluded → stable success), sets progressPct=100 + completedAt/ById + priorProgressPct=(previous progress), audit `partida.completed`, notify SUCCESS. Reopen: rejected while parent block is closed (reopen the block first), clears completion metadata, restores min(priorProgressPct ?? 99, 99), audit + notify. Manual progress (updatePartidaProgress and any registro-driven partida progress write) accepts ONLY integers 0–99; reaching 100 requires Conclude. `parseProgressPct` stays 0–100 for historical registro data; the partida-write paths enforce ≤99.

**Block (Segment):** `closedAt == null` = open. Close: authorized, transactional check that every non-deleted partida in the block has completedAt != null (empty block MAY close — decision: yes, closing an empty block is allowed and documented), audit `segment.closed`, notify. Closed blocks reject new partida creation (server-enforced in createPartida) and reject partida reopen. Reopen: authorized + audited + notified, re-enables creation.

**User archival:** reuse `disabledAt`. One transaction: set disabledAt, delete ProjectAssignments (capture their {projectId, role} in audit metadata first), write ONE AuditLog `user.archived` with the assignment list, then (post-tx) one `user.archived` notification per removed assignment to that project's recipients naming user/project/role/actor/timestamp/link. Restore (`disabledAt=null`) is supported but NEVER restores assignments; audit `user.restored`. Self-archive blocked. Archived users excluded from assignment selectors; shown behind an "Archivados" filter on the team page. Fresh-session gate already revokes access (verified: requireFreshSession redirects disabled users).

## 5. Offline sync error taxonomy (WS10)

QueuedRegistro.status gains `"blocked"` (needs login) and keeps `"error"` as TERMINAL (user action needed). Mapping: network/5xx → `pending` retryable (auto); 401 → `blocked` until next login (sync retries after auth); 403 → `error` terminal "sin acceso al proyecto"; 400 → `error` terminal with server message. UI (PendingEntries) shows the actual reason per state.

**Reminder policy (decision):** an offline capture with `clientCapturedAt` set skips the future-only check when `reminderDueAt >= clientCapturedAt - 60s` (it was valid at capture). It syncs successfully and is immediately overdue (appears in Pendientes por resolver as overdue). Online (non-offline) path keeps the future-only rule. Both capture time and intended reminder time are preserved (already stored).

## 6. Requests (WS5)

Creation form requires: kind (Change|Alert), severity (Important|Critical, no default preselect), title, ≥1 affected block, automatic GPS (state machine: acquiring/acquired/denied/unavailable/timeout/invalid; submission disabled until acquired; retry control; server validates BOTH coords in range lat∈[-90,90] lng∈[-180,180]; never one-sided; never null for NEW requests), reminder (existing mandatory rule stays). Resolution: existing 4-eyes rule stays; emits `request.resolved`/`request.rejected` (SUCCESS severity); preserves kind/severity historically; idempotent (already-resolved → stable error, no duplicate markers — existing status check).

## 7. Analytics (WS6)

Progress bars/indicators use ONE neutral color (accent). Remove `healthLevel`-derived red/yellow/green and phase labels from progress displays (analitica-tab, dashboard health rows). Green reserved for completed/resolved; yellow/red reserved for request severity. 100% renders only for concluded partidas (progress cap guarantees this).

## 8. Report archetypes (WS7) & PDF (WS11)

Archetype selector (required) on informe creation: OWNER / SENIOR_MANAGEMENT / PERSONAL_FEEDBACK; persisted on Informe; each branches the system prompt materially (see brief); shown in history + PDF label. Partida export button label → "Exportar Registro de Avance" / "Export Progress Record" (filename/content-type unchanged). Company seal (Company.sealKey) rendered on EVERY page of EVERY PDF export via a shared `pageAdded`-driven branding helper in `lib/report/pdf.ts` (small, bottom-right, must not overlap QR at top-right, page numbers bottom-center, or the informe firma block). Missing seal policy (decision): export proceeds without it; the response surfaces a warning for admins; not legally blocking (product may revisit).

## 9. File ownership (no agent edits another's files)

- **Lead:** prisma/schema.prisma + migration, lib/notifications/events.ts, i18n/dictionaries.ts scaffolding (agents may APPEND missing keys only within their own designated dict sections and must keep es/en shapes in sync).
- **Agent 1:** actions/admin.ts (archival parts), actions/partida-progress.ts, NEW actions/lifecycle.ts, app/partidas/[id]/page.tsx (lifecycle controls), lib/authz additions, admin team page archival controls if needed → NO: team page UI belongs to Agent 4; Agent 1 exposes server actions only.
- **Agent 2:** lib/notifications/* (except events.ts creation — may extend), actions/notifications.ts, app/notifications/page.tsx, NEW app/pending/ page+components, components/app-sidebar.tsx.
- **Agent 3:** app/projects/[id]/page.tsx, components/project-file-tree.tsx, bloque-spaces-panel.tsx, cambios-create.tsx, cambios-list.tsx, analitica-tab.tsx, actions/cambios.ts, actions/admin.ts createProject/updateProject owner field parts (coordinate: Agent 3 waits until Agent 1's admin.ts commit lands; lead sequences dispatches so this is safe), app/page dashboards health rows if needed.
- **Agent 4:** app/admin/page.tsx (team UI), member-profile-form.tsx, log-composer.tsx, lib/offline/*, api/offline/registros/route.ts, informes-tab.tsx, lib/informes/*, lib/report/*, report API routes, pending-entries.tsx (offline label/reasons).

Sequencing: Lead → Agent 1 → Agent 3 → Agent 2 → Agent 4 → integration. Lead commits after each agent's approved review.
