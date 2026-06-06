# Raphl — Continuation Prompt & Architect-Feedback Tracker

**Date:** 2026-06-05 · **Branch:** `feat/web-m1-core-loop` · **App:** `web/` (Next.js 15 + Prisma + Neon Postgres)

Paste this whole file as the opening prompt of a fresh session to continue the work. It captures (1) how to operate, (2) what's done, (3) what's left, and (4) a line-by-line tracker of the architect's feedback so nothing is missed.

---

## 1. How to operate (conventions — read first)

- **Workflow:** brainstorming → `superpowers:writing-plans` (save plan to `docs/superpowers/plans/`) → `superpowers:subagent-driven-development` (one foreground subagent per task/group + spec review + code-quality review) → `superpowers:finishing-a-development-branch`. Background subagents are **blocked from shell** in this environment — use **foreground** subagents.
- **Memory** (`~/.claude/projects/-Users-genel-Mirror-RECORD-360/memory/`): `raphl-github-metaphor-canon` (vocabulary), `raphl-roadmap-decisions` (phases + locked decisions + progress), `raphl-no-emoji-ui`. Read these at session start.
- **Vocabulary canon (locked):** Obra, **Bloque** (was Segmento; DB model stays `Segment`), Partida (work item), Registro (entry), **Cuaderno** (was Bitácora), Sello (hash), Solicitud de cambio (PR). Tabs: **Partidas | Planos | Cambios | Analítica | Ajustes**. Keep ES/EN dictionary shapes in sync (`Dict` derives from `es`).
- **NO EMOJI in the app UI** — monochrome SVG line icons (`components/icons.tsx`) or text only.
- **Patterns:** server actions return structured `{ ok } | { ok:false, error }` for user-facing forms (consumed via `useActionState`, never wipe input on error); every query is **tenant-scoped by `companyId`**; migrations are **additive** (no resets — real data in Neon); the immutable Registro hash chain must never change (relational pointers like `correctionOfId`/`changeRequestId` are NOT in `computeHash`).
- **Gates each task:** TDD where logic exists; `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and an emoji scan must all pass. Commit per task; do not push unless asked.
- **Decisions locked:** storage is an env-driven driver — **Cloudflare R2** (S3-compatible) in prod, local disk fallback in dev (P5); email via **Resend** (env-driven, P5); `ProjectAssignment` = **multiple members per role**, user can be on multiple projects; progress rollup = **equal** partida weight; Bloque sub-spaces = **per-Bloque**; Cambios approval **fans out to every Partida** under selected Bloques; reminders **in-app** v1; permanent delete **admin-only, only when a Partida has no Registros**.
- **Reference docs:** analysis `docs/superpowers/specs/2026-06-05-raphl-architect-feedback-analysis.md`; plans `docs/superpowers/plans/2026-06-05-raphl-phase0-hotfixes.md`, `...-phase1a-bloque-planos.md`, `...-phase1b-recycle.md`.
- **Test env:** `cd web && AUTH_TRUST_HOST=true npm run dev` (:3000) + optional `cloudflared tunnel --url http://localhost:3000` for external testers. Logins (company "Constructora Demo SRL"): `admin@record360.do` / `demo1234`; `manager|supervisor|resident@record360.do` / `test1234`. NOTE: running `npm run build` clobbers the running dev server's `.next` — restart dev after builds.
- **Pre-merge cleanup (do before finishing the branch):** `web/next.config.ts` has a TEMP `allowedDevOrigins: ["*.trycloudflare.com"]`; dev runs with `AUTH_TRUST_HOST=true` — both are tunnel-testing only. Branch finish (merge/PR) is still pending.

---

## 2. DONE (shipped to `feat/web-m1-core-loop`, verified green: 38 test files / 168 tests, lint/tsc clean)

### Phase 0 — Hotfixes
- Multimodal uploads fixed: root cause was the **1 MB server-action body limit** (now 60 MB) + images-only allowlist. Now image/PDF/video/audio upload, type derived from MIME, rendered by type (img/video/audio/doc-link); per-type caps 15/30/30/50 MB (caps sit under the 60 MB body limit so oversize gives a graceful message). Larger video needs the S3/R2 phase.
- **Auto-GPS** on note creation (button removed; saves even if denied).
- **Form no longer wipes on error** — `logRegistro` returns structured `LogResult`; composer uses `useActionState`.
- **Author name** shown on every Cuaderno entry.
- **Bitácora → Cuaderno** rename.

### Phase 1a — IA (Bloque + Partidas/Planos split + Planos upload)
- **Segmento → Bloque** everywhere (UI).
- Work-item tab is now **Partidas**; a new **Planos** tab holds uploaded plan files (PDF/image) **by date** with uploader + "Ver plano".
- New `Document` model + `createDocument` action + media-route authorization for plan files.

### Phase 1b — Delete Partidas + Recycle bin
- Soft-delete (`Partida.deletedAt` + `deletedById`); **deletePartida/restorePartida/purgePartida** actions (tenant + role gated).
- **Reciclaje** section in the Partidas tab: shows *borrado por <nombre> · fecha*, Restore, and **Borrar definitivamente only when the Partida has 0 Registros** (immutability preserved). 
- Deleted Partidas excluded from **all read paths** (project page, partida page → 404, dashboard counts) **and write paths** (`logRegistro`, `createChangeRequest`).

### Phase 1c — Rename + Move + AuditLog
- Generalized **`AuditLog`** model (companyId, actorId, action, targetType, targetId, summary, createdAt) — backbone for delete/rename/move history.
- **Rename** Project, Bloque, Partida (inline, role-gated, audited; names aren't hash-committed so safe).
- **Move** a Partida between Bloques (update `segmentId`; audited). UI in the file tree.

---

### Phase 1d — Partida search + filters (architect: "crítico")
- Search Partidas by name; filter by Bloque or Sin bloque; active and deleted results remain separated from Reciclaje.
- Advanced filters by tag/type, progress range, has-open-Cambios, date, author, and text-in-notes remain planned because they depend on P2/P3 data surfaces.

### Phase 2 — Roles/tenancy + Progress
- New **`ProjectAssignment`** model for multiple supervisors/residents per project; users can belong to multiple projects.
- Project page shows assigned supervisor/resident members and Admin/Manager assignment controls.
- Project-scoped visibility enforced for Resident/Supervisor: dashboard, project page, partida page, registro action, document uploads, Cambios, media route, and Partida structure actions use assignment-aware access.
- Assigned Resident/Supervisor can create/edit/delete/restore/move Partidas and Bloques inside their assigned project; permanent Partida purge remains Admin-only and only when empty.
- Progress input was removed from the note composer. Progress now lives on the Partida via an inline manual progress control.
- Bottom-up progress display uses active Partida progress: Partida -> Bloque -> Obra/project. Deleted Partidas are excluded.

---

### Phase 3 — Cambios rework + Tags + Replies
- Cambios are now **Bloque-scoped**: create form selects one or more Bloques, not Partidas.
- Cost/time fields are removed from the active Cambio create/list/detail workflow; old nullable DB columns remain for compatibility.
- Reject now requires and stores `rejectionReason`, shown on the detail page.
- Approval fans out note-style Registro markers to every active Partida inside the selected Bloques; deleted Partidas are excluded.
- Partida tags exist (`PartidaTag` + join model); inline comma-separated tag editing creates/reuses project-scoped custom tags.
- Note replies exist (`Registro.replyToId`) with same-Partida validation and a reply affordance in the Cuaderno. Reply metadata stays outside the hash payload.

### Phase 4 — Spaces + media views + indicators + reminders
- Project Partidas view now includes a **per-Bloque spaces panel** with lateral navigation: Bloque selector + Cuaderno, Planos, Planos Actualizados, Levantamientos, Ideas, Media, Recordatorios, Indicadores.
- `Document.segmentId` is wired: Planos, Planos Actualizados, Levantamientos, Ideas, Minutas/Documentos can be uploaded/listed per Bloque via `DocumentKind`.
- Media submenu groups Bloque attachments by type: IMAGE, VIDEO, AUDIO, PDF.
- Indicators show Bloque progress, active Partida count, recent Registro count, overdue reminder count, and no-reminder count.
- Registro reminders exist (`reminderDueAt`, `reminderResolvedAt`); composer can set a due date, and the Bloque panel lists reminders/overdue counts.
- Plan files still open by link; a true in-app PDF/large-image viewer remains open.

---

### Phase 5 — Production hardening (this run)
- **Voice dictation** in the note composer (Web Speech API, ES/EN, free; hidden on unsupported browsers). `455c359`
- **PDF audit report** — `Exportar PDF` streams a sealed, hash-stamped report of a Partida's Cuaderno via a pdfkit route (`/api/partidas/[id]/report`). `256cde1`·`250834b`·`f73e358`
- **In-app notification center** — `Notification` model + inbox page + nav unread badge; fires on Cambio created (→ reviewers) and resolved (→ author). `a9f7106`·`2e35745`·`4682a84`·`3eef1c1`
- **Project recycle completion** — ADMIN-only `purgeProject` permanently deletes an *archived, empty* obra (refuses if it holds partidas/cambios/documents). `78dda31`·`1774ea9`
- **Breadcrumbs** (Obras → Obra → Partida) + **feed pagination** (20/page, older/newer). `1ae59d4`·`c035130`·`5ded659`·`11a3d34`
- **Durable storage (Cloudflare R2)** — S3-compatible adapter behind an env-driven driver; files stay private, served through the authed media route. Activate via `S3_BUCKET`+endpoint+keys. `d7bb705` (guide: `2026-06-05-r2-storage-setup.md`)
- **Transactional email (Resend)** — env-driven mailer; delivers temp passwords on user-create + password-reset (best-effort). Activate via `RESEND_API_KEY`+`EMAIL_FROM`. `c2970ce` (guide: `2026-06-05-email-setup.md`)
- **PWA phase 1** — installable (manifest + brand icons) + production-gated offline app-shell service worker (disabled/unregistered in dev). `5e204ae`

---

## 3. LEFT (detailed)

### Needs a product/legal decision
- **Offline data capture** (PWA phase 2) — queue Registros locally + sync on reconnect; must respect the immutable hash chain (ordering/seal at sync time). Phase-1 PWA shell is shipped.
- **Digital signatures** (Ley 126-02) — *accredited* needs a paid trust-service provider + jurisdiction call. A free **authenticated sign-off** (identity + timestamp sealed into the hash chain) is buildable now — **selected next**.

### Cross-cutting (schedule separately)
- **In-app plan viewer** for PDFs/large images.
- **Advanced filters** by tag/type, progress, date, author, note text, and open-Cambios.
- **Analítica traffic lights** (full production analytics surface).
- **Reminder→notification** wiring: the notification center exists, but overdue reminders don't yet auto-generate notifications (time-based; needs a scheduled check).

### Done this run (were previously "cross-cutting")
- ~~S3/R2 storage~~ ✅ (adapter shipped; activate via env) · ~~Notification system~~ ✅ (Cambios events; reminders pending) · ~~Feed pagination~~ ✅ · ~~Voice transcription~~ ✅ · ~~PDF export~~ ✅ · ~~Offline/PWA~~ ✅ phase 1 (shell + installable; data capture pending).

---

## 4. Architect feedback tracker (check every item through and through)

Legend: `[x]` done · `[~]` partial/base exists · `[ ]` planned (phase noted).

### Notas
- [x] **Borrar partidas** — soft-delete + recycle (P1b). **Borrar proyectos**: archive/restore + ADMIN-only permanent delete of archived empty obras (P5 `purgeProject`).
- [x] **Carpeta de reciclaje** para partidas borradas; borrar definitivamente desde ahí; registro de qué se borró y cuándo (P1b).
- [x] **Planos ≠ partidas**; planos muestran los planos subidos por fecha; partidas aparte (P1a).
- [x] **% de avance junto a la partida, no en las notas; ajustable manualmente** (P2).
- [x] **Mover partidas entre bloques** (P1c).
- [x] **Buscador de partidas + opciones de búsqueda (crítico)** (P1d: nombre + Bloque; filtros avanzados dependen de P2/P3).
- [x] **Subir fotos/videos/documentos sin error** (P0) — note: video ≤50 MB until S3/R2.
- [x] **Nombre del usuario en las notas** (P0).
- [x] **"Abrir Bitácora completa" → "Abrir Cuaderno completo"** (P0).
- [x] **Un segmento de planos dentro de cada bloque** (P4 — per-Bloque Planos).
- [x] **"Segmento" → "Bloque"** (P1a).
- [x] **Cambios: entradas parecidas a las notas** (P3).
- [x] **Cambios: quitar Costo y Tiempo** (P3).
- [x] **Cambios: selección múltiple de bloques afectados** (P3).
- [x] **Cambios: gerente aprueba/rechaza con marcador; aprobado aparece en partidas afectadas; rechazado con campo de motivo/observaciones** (P3).
- [x] **Editar nombres de partidas, bloques y proyectos** (P1c).

### De lo conversado anteriormente falta
- [x] **Menú lateral indicativo de ubicación** (P4) + **breadcrumbs** Obras → Obra → Partida (P5).
- [x] **Submenús por tipo: fotos/videos/notas de voz/minutas/documentos/planos/notas** (P4 base grouping).
- [x] **Charts/indicadores micro/medio/general** (P4 base indicators; full Analítica traffic lights still production/analytics work).
- [x] **Etiquetas de tipo de partida + agrupar + crear propias** (P3).
- [x] **Levantamientos / Ideas / Planos Actualizados por bloque (+ observaciones a planos por fecha)** (P4).
- [~] **Alarmas/recordatorios obligatorios (lapso; avisar si no hay; alertar si vence)** — due dates + overdue/no-reminder counts exist; the in-app **notification center** (P5) delivers Cambios events, but overdue-reminder notifications still need a scheduled check.
- [x] **Ver supervisor y residente por proyecto** (P2).
- [x] **Residente puede agregar/quitar/editar partidas** (P2).
- [x] **Residente/Supervisor solo ven su proyecto asignado** (P2).
- [x] **% total de la partida visible y modificable ahí mismo, no en cada nota** (P2).
- [x] **Avance bottom-up: partida → bloque (total proporcional) → proyecto** (P2).
- [x] **Espacio para subir planos** (P1a — project-level; per-Bloque in P4).
- [x] **No borrar lo escrito cuando algo no se registra; mostrar error sin borrar** (P0).

### Idea
- [x] **Responder a una nota tipo WhatsApp (reply)** (P3 — note replies).

### Bugs / GPS
- [x] **Bug de subir archivos** (P0).
- [x] **GPS automático al crear la nota, no por botón** (P0).

**Score:** 30 done · 1 partial (overdue-reminder notifications — center exists, scheduled check pending) · remaining items are decision-gated (offline data capture, accredited signatures) or production polish (in-app plan viewer, advanced filters, analytics traffic lights). Cross-check this list after each phase.

---

## 5. Suggested next action
**Selected:** free **authenticated sign-off** (firma) for change orders/reports — identity + timestamp sealed into the existing hash chain (not legally accredited; that needs a paid TSP + jurisdiction call). Then, decision-gated: offline data capture (PWA phase 2), accredited signatures. Remaining polish: in-app plan viewer, advanced filters, analytics traffic lights, overdue-reminder → notification scheduled check.

**Pre-merge cleanup still pending:** TEMP `allowedDevOrigins`/`AUTH_TRUST_HOST` (tunnel testing); finish the branch (merge/PR). Activate R2 + Resend via env in prod (see setup guides).
