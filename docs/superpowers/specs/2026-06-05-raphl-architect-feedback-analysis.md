# Architect Feedback — Analysis & Roadmap

**Date:** 2026-06-05
**Source:** Field feedback from a practicing architect (target user) on the live build (`feat/web-m1-core-loop`, tested via tunnel).
**Status:** Analysis + phased roadmap. Decisions (§16) must be confirmed before detailed per-phase implementation plans.

This document translates the Spanish feedback, relates each item to the **actual current code**, gives a fix, and adds the gaps the feedback implies but does not state. The user said this is *essential to make the project work* — treat it as the M2/M3 definition.

---

## 1. Themes (the "big rocks")

Most of the ~35 notes are facets of a few deep changes:

1. **Upload pipeline is broken** (P0) — blocks the core multimodal value prop.
2. **IA reshape** — Planos must hold *plans*, not Partidas; rename Segmento→**Bloque**; per-Bloque sub-spaces; media-type submenus; lateral location nav.
3. **Roles, membership & tenancy** — Residents/Supervisors scoped to their assigned project; Resident must own Partida CRUD; show who's supervisor/resident.
4. **Progress model** — edited at the Partida (not in notes), rolled **bottom-up** Partida→Bloque→Project.
5. **CRUD + recycle + rename** — soft-delete Partidas with a recycle bin + audit; rename Projects/Bloques/Partidas; move Partidas between Bloques.
6. **Cambios rework** — revises what we shipped: Bloque-scoped (not Partida), no cost/time, manager approve/reject marker with rejection reason, note-style entries.
7. **Notes upgrades** — author name, WhatsApp-style replies, "Cuaderno" rename, automatic GPS.
8. **Search** (critical), **Tags**, **Charts/indicators**, **Reminders/alarms**.

---

## 2. P0 — Critical bugs (fix first, unblock testing)

### 2.1 Uploads fail for photos / videos / documents
> *"No me deja subir fotos, videos o documentos, me da error."*

**Now (root causes, three layers):**
- **Server Action body limit.** Uploads go through the `logRegistro` server action via `FormData`. Next.js caps server-action bodies at **1 MB by default** (`next.config.ts` sets no override). Phone photos are 2–5 MB → the action throws *before our code runs* → generic error. **This is the primary reason even photos fail.**
- **Images-only allowlist.** `lib/storage/mime.ts` allows only `jpeg/png/webp/gif`; `lib/registro/upload.ts` hard-codes `fileType: "IMAGE"`. Video/PDF/audio are rejected outright even though the `AttachmentType` enum already has `VIDEO/PDF/AUDIO`.
- **Per-file 5 MB cap** in `upload.ts` (too small for video).

**Fix:**
- Move large-file uploads off the server action into a dedicated **route handler** (`/api/upload`) that streams multipart (no 1 MB ceiling), or at minimum raise `serverActions.bodySizeLimit`. Route handler is the right answer for video.
- Expand the MIME allowlist: images + `application/pdf` + common video (`video/mp4`, `video/quicktime`) + audio (`audio/mpeg`, `audio/mp4`, `audio/webm`). Derive `fileType` from MIME. Keep SVG excluded (XSS).
- Raise per-type size caps (e.g. image 15 MB, pdf 25 MB, video 200 MB) and validate.
- Update the media route (`/api/media/[key]`) to serve non-image types with correct `Content-Type` (the current locked-down image CSP must not break PDF/video; use `Content-Disposition: inline` for pdf, range requests for video).
- **Gap:** local disk storage won't scale to video in production → see §15 (S3/R2). For "anyone testing" via tunnel, large video over a quick tunnel will also be slow.

### 2.2 Failed submit wipes everything typed
> *"Cuando algo no se puede registrar, se borra todo lo escrito… que simplemente diga que algo no se puede registrar sin borrar todo."*

**Now:** `log-composer.tsx` uses uncontrolled inputs with a thrown-error path; React 19 form actions reset uncontrolled fields on completion, so a failure loses the text.
**Fix:** convert the action to return a **structured result** (`{ ok, error }`) via `useActionState` instead of throwing; preserve field values on error and show an inline message. Only reset on success. Applies to the composer and every form (Cambios, create-partida, etc.).

### 2.3 GPS should auto-capture, not be a button
> *"el GPS… debe capturarse en automático al realizar la nota, no a través de un botón."*

**Now:** `log-composer.tsx` has a manual "Capturar GPS" button (`captureGps`).
**Fix:** request geolocation on composer mount (and refresh on submit); drop the button. Show a small "ubicación capturada / sin permiso" status. Handle denial gracefully (note still saves without GPS). Keep the hidden lat/lng fields.

---

## 3. Vocabulary changes (update the locked canon)

The architect overrides two canon terms (canon lives in `dictionaries.ts`; see memory `raphl-github-metaphor-canon`):
- **"Segmento" → "Bloque"** everywhere (UI label). DB model can stay `Segment` internally; relabel all strings. *(Update canon.)*
- **"Abrir Bitácora completa" → "Abrir Cuaderno completo"** — i.e. the log surface is a **"Cuaderno"** (notebook), not "Bitácora". Decide whether "Bitácora" → "Cuaderno" globally or only this label. *(Update canon; recommend global for consistency.)*

Also, the canon's **"Planos" = the work-item tab** is now wrong (see §4) — Planos becomes real plans; the work-item tree needs its own **"Partidas"** tab.

---

## 4. IA reshape — Planos vs Partidas, Bloques, sub-spaces

### 4.1 Planos must show plans, not Partidas
> *"En planos es donde están las partidas, no es así; los planos deben verse los planos que han ido subiendo y en orden con su fecha. Las partidas deben estar aparte."*

**Now:** the project workspace "Planos" tab renders `ProjectFileTree` (Bloques→Partidas). There is **no plan-file concept at all**.
**Fix:** split into two surfaces:
- **Partidas** tab — the work-item tree (today's content), Bloque-grouped.
- **Planos** tab — uploaded plan files (PDF/image), listed **by date**, newest first, with a viewer.
Requires a new file model (see §14) and a plan viewer.

### 4.2 Rename Segmento→Bloque + move Partidas between Bloques
> *"Cambiemos la palabra segmento por 'Bloque'." / "Se debe poder mover las partidas existentes a los segmentos que yo quiera."*

**Now:** `Partida.segmentId` is set only at creation (`createPartida`); no reassignment UI; label says "Segmento".
**Fix:** relabel; add a "move to Bloque" action (update `segmentId`), with drag-or-select UI. `segmentId` isn't hash-committed, so moving is safe for the ledger.

### 4.3 Per-Bloque structure + media submenus + lateral nav
> *"Debe haber un segmento de planos dentro de cada segmento." / "agregar… sub menús donde estén agrupadas las fotos, videos, notas de voz, minutas, documentos, planos y notas por separado (aparte del talonario de registro general)." / "Menú indicativo lateral de ubicación dentro de la ubicación." / "Levantamientos, Ideas y Planos Actualizados (dentro de Planos, un segmento de observaciones/correcciones, en orden y por fecha)."*

**Now:** flat — Project→Bloque→Partida→Registro feed only. No spaces, no media grouping, no breadcrumb tree.
**Fix:** introduce a **"Space" concept per Bloque** (and/or project): `Cuaderno` (general feed), `Planos`, `Planos Actualizados` (observations/corrections on plans, dated), `Levantamientos` (surveys), `Ideas`. Plus a **media view** that filters the Bloque's attachments by type (Fotos / Videos / Notas de voz / Minutas / Documentos / Planos / Notas) — derived from attachment `fileType` + a new `kind` tag, not a new table per type. Add a **lateral tree/breadcrumb** showing Project › Bloque › Partida › Space.

---

## 5. CRUD, recycle bin, rename

### 5.1 Delete Partidas (and finalize Project delete) + recycle bin + audit
> *"No permite borrar proyectos o partidas." / "carpeta de reciclaje para partidas borradas… borrar definitivamente desde ahí, pero que aparezca el registro de que eso se borró y cuándo."*

**Now:** Projects have soft-delete (`archivedAt`) + restore. **Partidas have no delete.** No recycle view, no audit of deletions.
**Fix:** add `Partida.deletedAt` (soft delete; Registros are immutable so a Partida is never hard-deleted while it has entries — it's hidden). A **Recycle/Reciclaje view** lists soft-deleted Partidas with **who deleted + when**; allows restore or permanent delete (permanent only when empty, or gated). Back this with a generalized **AuditLog** (§15) recording delete/restore/rename/move events.

### 5.2 Rename Projects, Bloques, Partidas
> *"No me permite editar los nombres de las partidas, ni de los bloques ni proyectos."*

**Now:** no rename action exists for any of the three.
**Fix:** inline rename (role-gated) with an audit entry. Names aren't hash-committed, so safe.

---

## 6. Roles, membership & tenancy (security-critical)

### 6.1 Resident must own Partida CRUD
> *"El residente no puede agregar ni quitar ni editar partidas, solo puede verlas. Debe poder hacerlo, es quien lleva el proyecto."*

**Now:** `createPartida`/`createSegment` require `ADMIN`/`MANAGER` (`requireAdmin`). Resident is read-only.
**Fix:** authorize Partida/Bloque CRUD for the **Resident assigned to that project** (and Supervisor/Manager/Admin). Requires project assignment (6.3).

### 6.2 Project-scoped visibility for Resident & Supervisor
> *"El residente está viendo todos los proyectos; solo debe ver el proyecto al que está asignado… Lo mismo para el supervisor."*

**Now:** dashboard lists **all** company projects for every role; authorization is company-level only.
**Fix:** scope project lists/detail to **assigned** projects for Resident/Supervisor (Admin/Manager see all in company). This is an access-control change — must be enforced server-side on every project/partida/registro query, with tests.

### 6.3 Show supervisor & resident per project
> *"En cada proyecto se debe ver quién es el supervisor y quién es el residente de obra."*

**Now:** no project↔user assignment model exists.
**Fix:** add **`ProjectAssignment(projectId, userId, role)`** (or `ProjectMember`). Drives 6.1/6.2 and the display. *(Decision §16: one resident+one supervisor per project, or many? can a user be on multiple projects?)*

---

## 7. Progress model (move out of notes + bottom-up rollup)

> *"El porcentaje de avance debe estar junto a la partida, no junto a las notas… ajustar manualmente." / "calcularse de abajo hacia arriba: partidas (residente) → Bloque (total proporcional de sus partidas) → proyecto (total proporcional de sus bloques)."*

**Now:** progress is entered **inside the note composer** (`progressPct` field) and `appendRegistroTx` writes it to `Partida.progressPct`. Project progress = **flat average of all partidas** (`projectProgress`), ignoring Bloques.
**Fix:**
- Remove `progressPct` from the note composer. Add a **direct, manually editable progress control on the Partida** (Resident-editable), recorded as an auditable change (optionally still an immutable "avance" entry for traceability).
- Compute **Bloque %** = proportional total of its Partidas; **Project %** = proportional total of its Bloques. *(Decision §16: equal weighting vs weighted partidas.)*
- Update `lib/project/progress.ts` to the two-level rollup; surface at all three levels (§12).

---

## 8. Cambios rework (revises the shipped feature)

Current Cambios (this branch): Partida-linked, with **cost + time** fields, seal-on-integrate + per-Partida marker, manager/admin integrate-reject, **no rejection reason**. The architect revises it:

> *"En 'Cambios' deben verse entradas parecidas a las notas." / "quitar Costo y tiempo." / "selección múltiple de los Bloques afectados." / "el gerente… marcador para aprobar o no; si se aprueba, la notificación aparece en las partidas afectadas; si no, una entrada para escribir por qué / observaciones."*

**Changes from what we built:**
- **Affected unit: Bloque, not Partida** — multiselect of Bloques. *(Decision §16: on approval, does the notification land on the Bloque, or fan out to every Partida under the selected Bloques? Feedback says "partidas afectadas" — likely fan-out.)*
- **Remove `costImpact` + `daysImpact`** from the form/UI (keep columns nullable or drop in a migration).
- **Add a rejection-reason / observations field** captured on reject (and visible).
- **Entries styled like notes** (reuse the note/registro card visual), framed as "notificaciones de registro de solicitud."
- **Approval marker** = the manager's approve/reject control (already exists as Integrar/Rechazar — keep, add reason on reject).
- Keep the seal + immutable propagation into affected Partidas' Cuaderno on approval (this part was right).

**Net:** a focused revision of the Cambios slice, not a rebuild. The seal/marker mechanic and tenant/role guards stay.

---

## 9. Notes / Registro upgrades

### 9.1 Author name on notes
> *"En las notas debe aparecer el nombre del usuario quien escribió la nota."*
**Now:** `Registro.authorId` is a bare string (no `User` relation); the record card shows no author.
**Fix:** resolve author name (lookup or add a relation) and render it on every note. *(Low-effort, high-value — fold into P0/Phase 1.)*

### 9.2 "Cuaderno" rename — see §3.

### 9.3 Reply to a note (WhatsApp-style)
> *"poder hacer click derecho en una nota… 'Reply'."*
**Now:** none. (We have `correctionOfId` for corrections, a different concept.)
**Fix:** add `Registro.replyToId` (append-only reply referencing a parent); render threaded under the parent with a quote. Keeps immutability (replies are new entries). *(Decision §16: reply chain depth / display.)*

---

## 10. Search + filters (critical)
> *"Falta el buscador de partidas y las distintas opciones de búsqueda (es crítico)."*
**Now:** `dashboard-search.tsx` is client-side filtering of **projects** only.
**Fix:** a **Partida search** with filters (by Bloque, tag/type, progress range, has-open-Cambios, date, author, text in notes). Start with server-side `ILIKE`/Prisma filters; add DB full-text later (§15). Likely also a global search.

---

## 11. Tags / Partida types
> *"etiquetas para designar el tipo de partida y agruparlas (Mampostería, diseño, ebanistería, construcción ligera…), con opción de crear etiquetas propias."*
**Now:** none.
**Fix:** `Tag(companyId|projectId, label, color?)` + `PartidaTag` join; seed common construction types; allow custom; filter/group Partidas by tag (ties into §10 search).

---

## 12. Charts & indicators (micro / medio / general)
> *"charts e indicadores a nivel micro (cada partida), medio (cada bloque) y general (proyecto)."*
**Now:** only inline progress bars; the "Analítica" tab is a disabled stub.
**Fix:** build the Analítica surface with progress + activity indicators at all three levels, fed by the §7 rollup. Pairs with the PRD's traffic-light health dashboard (Red/Yellow/Green) — already have the color tokens.

---

## 13. Reminders / alarms
> *"sistema de alarmas o recordatorios obligatorio (indicar lapso de tiempo); si no se puso recordatorio, que lo diga; si pasa el recordatorio, alertas de que las observaciones a resolver no han sido abordadas."*
**Now:** none.
**Fix:** `Reminder(targetType, targetId, dueAt, createdBy, resolvedAt?)` attached to observations/notes (and/or Partidas). Mandatory timeframe on creation; UI flags items **without** a reminder; overdue items raise in-app **alerts/notifications**. *(Decisions §16: what can carry a reminder; notification delivery — in-app vs email/push.)*

---

## 14. Plans upload + viewer + per-Bloque plan spaces
> *"No hay un espacio donde pueda subir planos." (+ §4.1, §4.3)*
**Now:** no plan model/upload/viewer.
**Fix:** a **`Document`/`Plano` model** (projectId, bloqueId?, kind ∈ {PLANO, LEVANTAMIENTO, IDEA, MINUTA, DOCUMENTO, PLANO_ACTUALIZADO}, file ref, uploadedBy, createdAt, supersedesId? for plan versions), listed by date. A **viewer** (PDF/large image) and, for "Planos Actualizados", dated **observations/corrections** entries on a plan. This subsumes §4.1 and §4.3's per-Bloque planos.

---

## 15. Gaps the feedback implies but doesn't state (we should add)

- **Production media storage (S3/R2 + CDN)** — local disk can't serve video at scale; required before real multimodal use (already a known debt).
- **Generalized AuditLog** — one table powering the recycle-bin "who/when", renames, moves, Cambios decisions, progress edits. Cheaper than per-feature logging.
- **Notification system** — a shared in-app inbox feeding Cambios approvals (§8), overdue reminders (§13), and assignments; later email/push (PRD field reality: residents are mobile).
- **Offline-first / PWA (PRD F3.1–F3.2)** — *the* headline PRD differentiator, absent from this feedback but essential for field use (basements, no signal). Should be scheduled.
- **Pagination / virtualization** of Cuaderno feeds (PRD NF5: thousands of entries) — currently unbounded.
- **Permissions matrix** — once Residents get CRUD and visibility is project-scoped, formalize role×resource×action and **test it** (security regressions are the real risk here).
- **Voice dictation + transcription (PRD F2.2)** — "notas de voz / minutas" appear as media types; capture now, transcribe later.
- **Data migration & seed** updates for Segmento→Bloque relabel, ProjectAssignment, Tags, Documents, Reminders, AuditLog.
- **i18n/a11y parity + no-emoji rule** for every new surface (memory `raphl-no-emoji-ui`).
- **PDF export & digital signatures (PRD F4.4–F4.5)** — still later milestones.

---

## 16. Open decisions (confirm before detailed plans)

- **D1 — Project tab IA:** new tabs = **Partidas | Planos | Cambios | Analítica | Ajustes**? (splits today's "Planos").
- **D2 — Bloque sub-spaces:** are Cuaderno / Planos / Planos Actualizados / Levantamientos / Ideas **per-Bloque**, per-Project, or both? Are the media-type submenus per-Bloque?
- **D3 — Progress weighting:** Bloque/Project rollup by **equal** partida weight, or weighted (e.g. by a partida "size")? Equal is simpler for v1.
- **D4 — Cambios scope:** affected selection is by **Bloque**; on approval does the marker fan out to **every Partida** under those Bloques (feedback says "partidas afectadas") or stay at Bloque level?
- **D5 — Reminders:** what can carry one (observations/notes only, or also Partidas/plans)? Delivery: in-app only for v1, or email/push too?
- **D6 — Storage:** stand up **S3/R2 now** (needed for video + external testing) or keep local disk for one more iteration?
- **D7 — Membership:** one Resident + one Supervisor per project, or multiple? Can a user belong to multiple projects?
- **D8 — Recycle/permanent delete:** who may permanently delete, and is it ever allowed when a Partida has immutable Registros (vs. always keep, hide-only)?

---

## 17. Proposed phasing

- **Phase 0 — Hotfixes (small, unblock testing):** uploads (route handler + multimodal MIME + media serving) · GPS auto-capture · preserve form on error · author name on notes · "Cuaderno" rename.
- **Phase 1 — Vocabulary + IA + CRUD:** Segmento→Bloque relabel · split Partidas vs Planos tabs · Partida soft-delete + recycle + AuditLog · rename Project/Bloque/Partida · move Partida between Bloques · Partida search + filters.
- **Phase 2 — Roles/tenancy + progress:** ProjectAssignment + scoped visibility + Resident CRUD · show supervisor/resident · progress on Partida + bottom-up rollup + manual edit.
- **Phase 3 — Cambios rework + tags + replies:** Bloque-scoped Cambios, no cost/time, rejection reason, note-style · Tags · note replies.
- **Phase 4 — Spaces + plans + charts + reminders:** per-Bloque spaces & media submenus & lateral nav · plan upload/viewer + Planos Actualizados · Analítica charts (micro/medio/general) · reminders/alarms + notifications.
- **Cross-cutting (schedule separately):** S3/R2 storage · offline/PWA · voice dictation · PDF export · digital signatures.

Each phase gets its own `writing-plans` plan and a `subagent-driven-development` execution pass, like the Cambios slice.
