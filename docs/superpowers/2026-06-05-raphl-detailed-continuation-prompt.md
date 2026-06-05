# Raphl Detailed Continuation Prompt

**Date:** 2026-06-05  
**Current branch:** `feat/web-m1-core-loop`  
**Current base HEAD when this file was created:** `f1db1b2 docs: status + continuation prompt + architect-feedback tracker`  
**App root:** `web/`  
**Stack:** Next.js 15, React 19, Prisma 6, Neon PostgreSQL, NextAuth v5  

Use this prompt to continue the work in a fresh session. It is intentionally explicit: do not infer missing product requirements. If an item is not marked done below, it is not done.

## Operating Rules

1. Work from `/Users/genel/Mirror/RECORD-360`.
2. Keep all app commands inside `web/`.
3. Do not reset or rewrite migrations. Neon has real data.
4. Do not alter the immutable Registro hash payload. `correctionOfId`, `changeRequestId`, future `replyToId`, and audit pointers are metadata and must stay outside `computeHash`.
5. Every DB access that returns project, partida, registro, document, media, cambio, or assignment data must be tenant-scoped by `companyId`.
6. UI vocabulary is locked:
   - Obra = project/site.
   - Bloque = Segment UI label. DB model remains `Segment`.
   - Partida = work item.
   - Registro = entry/note.
   - Cuaderno = full note log.
   - Sello = hash/seal.
   - Solicitud de cambio = change request.
7. No emoji in the app UI. Use `web/src/components/icons.tsx` SVG icons.
8. User-facing server actions should return structured results for forms where inline errors matter:
   - success: `{ ok: true }`
   - failure: `{ ok: false, error: string }`
   - client forms should use `useActionState` and must not wipe input on failure.
9. After each phase run:
   - `npm test`
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `rg -n "[😀-🙏]" web/src` or equivalent emoji scan
10. Before merge, remove tunnel-only config:
   - `web/next.config.ts` currently has temporary `allowedDevOrigins: ["*.trycloudflare.com"]`.
   - local tunnel testing uses `AUTH_TRUST_HOST=true`.

## Current Verified State

Latest completed code includes P0, P1a, P1b, P1c, P1d, P2, P3, and P4. Reported verification after P4:

- 26 test files passing.
- 114 tests passing.
- ESLint clean.
- TypeScript clean.
- Production build clean.

If continuing, verify again before making changes.

## What Is Done

### P0 Hotfixes

P0 is complete.

1. Upload bug fixed:
   - Server action body limit raised to 60 MB.
   - Uploads accept image, PDF, video, and audio.
   - MIME allowlist derives `AttachmentType`.
   - Per-type caps:
     - image: 15 MB
     - PDF: 30 MB
     - audio: 30 MB
     - video: 50 MB
   - Caps intentionally sit below the 60 MB body limit so users see app-level errors, not opaque framework failures.
   - Media is rendered by type.
   - Storage is still local disk. S3/R2 is not done.
2. GPS fixed:
   - GPS auto-captures on opening the composer.
   - There is no manual GPS button in the intended current flow.
   - Denied GPS must not block note creation.
3. Composer error flow fixed:
   - Form should not wipe text/files on validation failure.
   - Inline error shown.
4. Author names fixed:
   - Cuaderno entries show who wrote each note.
5. Vocabulary fixed:
   - Bitacora/Bitácora changed to Cuaderno.
6. Correction support exists:
   - `correctionOfId` is accepted and validated same-partida.
   - A correction UI affordance exists.
7. Media endpoint is tenant-authorized:
   - Registro attachments.
   - Cambio evidence.
   - Document/Plano files.

### P1a IA: Bloque + Partidas/Planos Split

P1a is complete.

1. Segmento is renamed to Bloque in UI strings and validation messages.
2. Project page has a Partidas tab.
3. Project page has a Planos tab.
4. Planos tab supports uploading project-level plan files.
5. Planos are listed by date with uploader and a view/open link.
6. New `Document` model exists.
7. `createDocument` action exists.
8. Media authorization covers `Document` files.

Important limitation: Planos are project-level right now. Per-Bloque Planos spaces are still planned in P4.

### P1b Delete Partidas + Reciclaje

P1b is complete.

1. `Partida` has soft-delete columns:
   - `deletedAt`
   - `deletedById`
2. Admin/Manager can soft-delete Partidas.
3. Deleted Partidas are hidden from active views.
4. Reciclaje section exists in the Partidas tab.
5. Reciclaje shows who deleted and when.
6. Restore works.
7. Permanent delete works only when the Partida has zero Registros.
8. Write paths are hardened:
   - `logRegistro` rejects deleted Partidas.
   - `createChangeRequest` rejects deleted Partidas.

Important limitation: project-level recycle/delete-forever is not done. Project archive/restore exists, but it is not the same as the new Reciclaje behavior.

### P1c Rename + Move + Audit Log

P1c is complete.

1. `AuditLog` model exists with tenant, actor, action, target, summary, metadata, and indexes.
2. Additive migration exists: `web/prisma/migrations/20260605155127_audit_log/migration.sql`.
3. Audit helper exists: `web/src/lib/audit/log.ts`.
4. Rename actions exist:
   - Project/Obra.
   - Segment/Bloque.
   - Partida.
5. Move action exists:
   - Move Partida to another Bloque or to ungrouped.
6. Role gate:
   - Admin/Manager.
7. Tenant gate:
   - companyId on every action.
8. Validation:
   - empty names blocked.
   - long Bloque names blocked through `parseSegment`.
   - duplicate Bloque names blocked case-insensitively within a project.
   - cross-project Bloque move blocked.
   - deleted Partida move/rename blocked.
9. Audit rows are written for:
   - project rename.
   - Bloque rename.
   - Partida rename.
   - Partida move.
   - Partida delete.
   - Partida restore.
   - Partida permanent delete.
10. UI exists:
   - project title rename control.
   - Bloque rename control in the Partidas tree.
   - Partida rename control in the Partidas tree.
   - Partida move selector in the Partidas tree.
11. Tests cover rename, move, duplicate blocking, role blocking, deleted Partida blocking, audit rows, and hash-chain preservation.

### P1d: Partida Search + Filters

P1d is complete for the architect's critical request.

1. Search UI in the Partidas tab.
   - Search by Partida name.
   - Server-driven query params are stable (`q`, `block`).
2. Filters.
   - Bloque filter exists.
   - Ungrouped/Sin bloque filter exists.
   - Deleted/active should remain separate: active tab does not show deleted; Reciclaje handles deleted.
3. Empty states.
   - "No results" is distinct from "no partidas yet".
4. Tests.
   - Pure filter helper covers name, Bloque, Sin bloque, combined filters, and active empty results.

Future advanced filters by tag/type, progress, date, author, note text, and open-Cambios remain dependent on P2/P3 data work.

### P2: Roles, Assignments, and Progress Rollup

P2 is complete.

1. `ProjectAssignment` model exists.
   - Multiple supervisors/residents per project.
   - A user can belong to multiple projects.
   - Unique `[projectId, userId]`.
2. Assignment UI exists.
   - Admin/Manager assign supervisor(s) and resident(s) to a project.
   - Project page shows assigned supervisor/resident names.
3. Visibility rules are assignment-aware.
   - Admin/Manager see company projects.
   - Supervisor/Resident see only assigned projects.
   - Enforced in dashboard, project page, partida page, media route, document uploads, registro actions, cambio actions, and Partida structure actions.
4. Resident/Supervisor project permissions are widened only on assigned projects.
   - Assigned members can create/edit/delete/restore/move Partidas and Bloques.
   - Permanent Partida purge remains Admin-only and only when empty.
   - Assigned members can upload project-level Planos.
5. Progress refactor is complete.
   - Progress input removed from note composer.
   - Manual progress control added on Partida.
   - Progress lives with Partida; `Registro.progressPct` is preserved only for historical compatibility.
6. Bottom-up rollup is active.
   - Partida progress is manual.
   - Bloque and Project progress use active Partidas.
   - Deleted Partidas are excluded.
7. Tests cover project assignment, assigned/unassigned Resident access, document access, media authorization, cambio access, structure CRUD, and progress updates.

### P3: Cambios Rework + Tags + Replies

P3 is complete.

1. Cambios are Bloque-scoped through `ChangeRequestSegment`.
2. Create form selects one or more Bloques.
3. Approval fans out note-style Registro markers to active Partidas under selected Bloques.
4. Deleted Partidas do not receive markers.
5. Cost/time fields are removed from the active UI path; old nullable DB fields remain for compatibility.
6. Reject requires `rejectionReason`, stores it on `ChangeRequest`, and shows it in detail.
7. Partida tags exist (`PartidaTag`, `PartidaTagOnPartida`) with inline comma-separated editing and project-scoped custom tags.
8. Note replies exist (`Registro.replyToId`) with same-Partida validation and a reply affordance.
9. Reply/correction/Cambio pointers remain metadata outside the hash payload.
10. Tests cover Bloque multiselect, approval fan-out, deleted Partida exclusion, reject reason, tags, replies, and hash-chain validity.

### P4: Per-Bloque Spaces, Media Views, Charts, Reminders

P4 base is complete.

1. Project Partidas view includes a per-Bloque spaces panel with lateral navigation.
2. Spaces: Cuaderno, Planos, Planos Actualizados, Levantamientos, Ideas, Media, Recordatorios, Indicadores.
3. `Document.segmentId` is wired for per-Bloque uploads and listings.
4. `DocumentKind` powers Planos, Planos Actualizados, Levantamientos, Ideas, Minutas, and Documentos.
5. Media view groups Bloque attachments by IMAGE, VIDEO, AUDIO, PDF.
6. Indicators show Bloque progress, active Partidas, recent Registros, overdue reminders, and no-reminder counts.
7. `Registro.reminderDueAt` / `reminderResolvedAt` exist; composer can set due dates.
8. Recordatorios space lists due reminders; active notification delivery remains cross-cutting.
9. Plan files still open by external media link; a true in-app PDF/large-image viewer remains open.

## What Remains

## Cross-Cutting Work Still Open

These are not optional for production, but they are outside the architect-feedback phases above.

1. S3/R2 cloud storage.
   - Local disk is not production-ready.
   - Needed for deploy durability and videos larger than current 50 MB cap.
   - Prefer presigned direct uploads for large video.
2. Pagination.
   - Partida Cuaderno currently risks loading too many Registros.
   - Add cursor pagination or infinite scroll.
3. Chain verification UI/API.
   - `verifyChain` exists and is tested.
   - Product needs a visible "Verificar integridad" action.
4. Password reset/change.
   - Admin temp password flow exists.
   - Recovery/change flow missing.
5. Voice dictation/transcription.
   - Uploads can support audio now.
   - Transcription/dictation is not done.
6. Offline-first/PWA.
   - Still missing.
   - Important for construction sites.
7. PDF report export.
   - Not done.
8. Digital signatures under Dominican Law 126-02.
   - Hash chain is tamper-evidence, not legal digital signature.
9. Executive analytics dashboard.
   - Analitica tab still not complete.

## Architect Feedback Tracker

Use this as the source of truth. Update after every phase.

### Done

- [x] Subir fotos/videos/documentos.
- [x] GPS automatico al crear nota.
- [x] No borrar lo escrito cuando falla el registro.
- [x] Nombre del usuario en notas.
- [x] Bitacora/Bitácora -> Cuaderno.
- [x] Segmento -> Bloque.
- [x] Planos separados de Partidas at project level.
- [x] Planos listados por fecha.
- [x] Espacio para subir Planos at project level.
- [x] Borrar Partidas with soft delete.
- [x] Reciclaje for deleted Partidas.
- [x] Restore deleted Partidas.
- [x] Permanent delete only when empty.
- [x] Deleted Partidas excluded from reads and writes.
- [x] Editar nombres de Obras, Bloques, Partidas.
- [x] Mover Partidas entre Bloques.
- [x] General AuditLog for rename/move/delete/restore/purge.
- [x] Buscador de Partidas by name.
- [x] Partida filter by Bloque / Sin bloque.
- [x] Resident/Supervisor project assignment model.
- [x] Supervisor/resident displayed per project.
- [x] Resident/Supervisor only see assigned projects.
- [x] Resident can create/edit/delete/move Partidas on assigned project.
- [x] % avance next to Partida, manually editable there.
- [x] Remove progress editing from note composer.
- [x] Bottom-up progress rollup Partida -> Bloque -> Obra.
- [x] Cambios as note-like entries.
- [x] Cambios no cost/time.
- [x] Cambios multiselect Bloques affected.
- [x] Cambios rejection reason/observations.
- [x] Tags for Partida type and custom tags.
- [x] Reply to note like WhatsApp.
- [x] Lateral location navigation.
- [x] Media submenus by type.
- [x] Per-Bloque spaces: Cuaderno, Planos, Planos Actualizados, Levantamientos, Ideas.
- [x] Charts/indicators base views.
- [x] Reminder due dates plus overdue/no-reminder counts.

### Partial

- [~] Borrar proyectos.
  - Existing: archive/restore project.
  - Missing: project Reciclaje/delete-forever equivalent.
- [~] Reminders/alarms.
  - Existing: due dates, Recordatorios space, overdue/no-reminder counts.
  - Missing: active notification delivery.

### Not Done

- [ ] Advanced Partida filters by tag/type, progress, date, author, note text, and open-Cambios.
- [ ] Full analytics traffic-light dashboard.
- [ ] Active reminder/Cambio notification system.
- [ ] In-app plan viewer.
- [ ] S3/R2 storage.
- [ ] Pagination for Cuaderno/Registros.
- [ ] Chain verification UI/API.
- [ ] Password reset/change.
- [ ] Voice dictation/transcription.
- [ ] Offline-first/PWA.
- [ ] PDF report export.
- [ ] Legal digital signatures.
- [ ] Executive analytics dashboard.

## Recommended Next Sequence

1. Production hardening: S3/R2, pagination, chain verification UI, password reset, offline/PWA, PDF export, legal signatures, analytics.
2. Finish product-depth items: in-app plan viewer, active notification delivery, advanced filters, voice transcription.

## First Command Checklist For A Fresh Session

Run:

```bash
cd /Users/genel/Mirror/RECORD-360
git status --short
git log --oneline -5
cd web
npm test
npm run lint
npx tsc --noEmit
npm run build
```

If build fails only on Google font DNS, rerun with network access. If any other gate fails, stop and fix before starting new work.
