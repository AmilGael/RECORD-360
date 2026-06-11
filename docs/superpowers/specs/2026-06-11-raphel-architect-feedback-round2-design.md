# Raphel — Architect Feedback Round 2: Analysis & Design

**Date:** 2026-06-11
**Status:** Design approved in conversation; this doc is the implementation reference.
**Source:** Second feedback batch from the architect (tested the live build via tunnel, 2026-06-08).
**Prior round:** `2026-06-05-raphl-architect-feedback-analysis.md` (all phases shipped before this round).

**Decisions already made (with owner):**
- **D1 — Name is "Raphel"** (not Raphl). Rename everywhere; update canon memory.
- **D2 — AI report generator: build now**, Claude API (Sonnet 4.6 default).
- **D3 — Dashboard analytics move per-project** (existing Analítica tab); dashboard keeps dual chart + list + search.
- **D4 — Phasing:** R0 quick wins → R1 data model → R2 reports+AI (pulled up) → R3 IA reshape.

**Invariants:** every round lands green (tests, lint, build) before the next; ES/EN parity for all strings; no-emoji rule (monochrome SVG icons via `icons.tsx`); registros stay immutable; authz changes get tests.

---

## R0 — Vocabulary, permissions, fixes (~1 day)

### R0.1 Rename Raphl → Raphel
> *"La Plataforma se llama Raphel, en el nombre solo dice Raphl."*

**Now:** "Raphl" in ~10 files: `dictionaries.ts`, `layout.tsx` metadata, `manifest.ts`, landing `page.tsx`, `email/templates.ts`, offline components (`pending-entries`, `sync-indicator`, `offline-provider`, `queue.ts`), `log-composer.tsx`, PDF report header.
**Fix:** global rename to **Raphel**. Update memory `raphl-github-metaphor-canon`. Netlify site rename (`raphl-record360` → `raphel-…`) optional/cosmetic — defer until production deploy is wired.

### R0.2 Health-bar phase labels
> *"'En Rojo' → 'Fase de Definición' / 'En Amarillo' → 'Fase de Avance' / 'En Verde' → 'Fase Terminación'."*

**Now:** `analyticsGreen/Yellow/Red` = "En verde/amarillo/rojo" (dictionaries 82–84); colors derive from progress thresholds.
**Fix:** relabel only — Rojo→**Fase de Definición**, Amarillo→**Fase de Avance**, Verde→**Fase de Terminación** (EN equivalents). Color logic untouched. These widgets later move per-project in R3; relabel now anyway (cheap, instantly visible).

### R0.3 Per-space upload labels
> *"En cada apartado dice 'Subir Planos'… debe decir lo que es el apartado."*

**Now:** single `upload: "Subir plano"` for every space.
**Fix:** label keyed by `DocumentKind`: Subir plano / levantamiento / minuta / documento / idea.

### R0.4 Merge "Planos" + "Planos Actualizados"
> *"El apartado de 'Planos' y el de 'Planos Actualizados' debe ser el mismo."*

**Now:** separate spaces (kinds `PLANO`, `PLANO_ACTUALIZADO`) — round 1 split them; the architect reverses that.
**Fix:** UI merge into one **Planos** space listing both kinds, dated newest-first. Enum value stays (history intact); new uploads → `PLANO`; the Planos Actualizados submenu disappears. No migration.

### R0.5 Role descriptions in Equipo
> *"abundar un poco más en el Rol de cada tipo de usuario (alcance y sinónimos)."*

**Now:** one-liners (e.g. ADMIN at dictionaries:242).
**Fix:** expanded scope text + synonyms per role (e.g. RESIDENT — "Residente / Ingeniero residente: lleva el día a día de la obra; crea y edita partidas, registra avances…").

### R0.6 Sidebar counts gated to ADMIN/MANAGER
> *"Solo deben de poder hacerlo el Gerente general y el Administrador."*

**Now:** `app-sidebar.tsx` shows active/archived counts to every role (no gating found).
**Fix:** render counts only for ADMIN/MANAGER; RESIDENT/SUPERVISOR see only their assigned obras nav.

### R0.7 Manager can upload in spaces
> *"El gerente de proyectos debe de poder subir contenido en los distintos espacios."*

**Now (verified during planning):** code already permits this everywhere — UI gate
`canEditStructure = hasCompanyWideAccess(role) || assigned` (`projects/[id]/page.tsx:65`)
and server gates (`createDocument` → `canAccessProject`; `logRegistro` →
`projectAccessWhere`) all include MANAGER. The architect's report most likely came
from testing with an account whose role wasn't actually MANAGER (seed only creates
admin@record360.do/ADMIN).
**Fix:** lock the behavior with regression tests (unassigned MANAGER can upload a
document and post a registro). If a test fails, fix the revealed gap; if green, the
item is closed-by-verification and the user should double-check the architect's
test-account role.

### R0.8 Surface "Borrar obra"
> *"No aparece la opción de poder borrar una obra (en caso de crear una por error)."*

**Now:** `purgeProject` exists (ADMIN-only, only when empty) but lives in the Equipo/admin screen — invisible where the architect looked.
**Fix:** delete control in the project's settings/edit controls with **double confirmation**. Empty obra → purge (his "created by error" case). Non-empty → explain the immutability guard and offer **Archivar** instead. Policy unchanged, discoverability fixed.

### R0.9 Notify on permanent deletes
> *"En notificaciones debe de aparecer cuando se borra algo definitivamente (lo que sea)."*

**Now:** purges write `AuditLog` but no notification.
**Fix:** `purgeProject` / `purgePartida` (and R3's bloque delete) call `createNotifications` → ADMIN/MANAGER + the obra's assigned users. Type `delete.permanent`, body says what + who + when.

### R0.10 Cambios: mandatory reminder, close button, feedback notification
> *"Las solicitudes de cambios tienen que colocarse los recordatorios obligatoriamente." / "no me aparece el botón con el que puedo cerrar una solicitud de cambio… debe aparecer en notificaciones cuando se cierra… entrada de Feedback… verse la notificación del feedback."*

**Now:**
- Reminder on a cambio is optional.
- **Close-button root cause:** `canResolve = isManager && OPEN && cr.authorId !== u.id` (`cambios/[crId]/page.tsx:34`) — the author-exclusion hid the button because the architect (admin) created the request himself. Server action allows ADMIN/MANAGER fine.
- Notifications exist for `cambio.created` (→ADMIN/MANAGER) and resolution (line 127), but there is no required feedback entry on close.

**Fix:**
- `reminderDueAt` **required** in `cambios-create` (client + server validation).
- Relax author-exclusion: **ADMIN may always resolve** (small-team reality); MANAGER still can't resolve their own (4-eyes when possible).
- **Feedback (observaciones) required on close** — both integrate and reject; stored on the CR; rendered in the detail view.
- Closing notifies the author + assigned users (`cambio.resolved`, includes the feedback text).

### R0.11 Icon sweep (part 1)
> *"Hay que hacer uso de íconos y logos representativos…"*

**Fix:** representative monochrome SVG icons (extend `icons.tsx`) on primary action buttons: subir, borrar, archivar, cambios, reportes, equipo, etc. No emoji (canon). Part 2 rides along with each R1–R3 surface.

---

## R1 — Data model round (~1–2 days)

### R1.1 Project cover photo
> *"poder agregar una foto como portada… al lado del nombre… verse en el botón de ingreso y al entrar."*

**Schema:** `Project.coverImageKey String?`. Upload (jpeg/png/webp, existing storage layer + mime allowlist) at creation and from project settings. Render: dashboard card thumb, project entry button, project header.

### R1.2 Unique registration code + QR
> *"un Código de Registro Único e inalterable junto con un Código QR, que certifique que es un registro perteneciente a ese proyecto."*

**Schema:** `Project.registrationCode String @unique` — generated at creation (`RPH-XXXX-XXXX`, Crockford base32, no ambiguous chars), **never editable** (no update path; not in any form). **Migration backfills** existing projects.
**QR:** rendered on demand (no storage) encoding `APP_URL/verify/{registrationCode}` → minimal **public** certificate page: obra name, company, "registro válido desde {createdAt}". Nothing else leaks. QR appears on the project header and on every report (R2).

### R1.3 User profile fields: phone, photo, firma
> *"Num. de celular o flota, una foto del Usuario y también su firma en formato PNG con fondo transparente o blanco."*

**Schema:** `User.phone String?`, `User.photoKey String?`, `User.signatureKey String?`. Firma upload is **PNG-only** (validated); photo jpeg/png/webp. Editable in Equipo (ADMIN/MANAGER edit anyone; users edit their own). Rendered beside member info.

### R1.4 Company seal
> *"se debe poder agregar el sello de la compañía en formato PNG… para agregar en los informes."*

**Schema:** `Company.sealKey String?`. PNG-only, ADMIN uploads in Equipo. Consumed by R2 reports.

### R1.5 Assignment counts in Equipo
> *"poder entrar a ver en los residentes y supervisores, a cuantas obras están asignados."*

**Fix:** Equipo lists assigned-obra count per RESIDENT/SUPERVISOR with drill-down to the obra list (links). Data already exists (`ProjectAssignment`).

### R1.6 Archived obras: access revocation
> *"Cuando una obra se archive, estos deben de perder el acceso… solo el Gerente general y el administrador podrán acceder."*

**Now:** `canAccessProject` ignores `archivedAt` for assigned users.
**Fix:** RESIDENT/SUPERVISOR access denied when `archivedAt != null` (lists, detail, partidas, registros, media, search results). ADMIN/MANAGER unaffected. Enforced in `lib/authz/projects.ts` (single choke point) + tests.

---

## R2 — Reports + AI generator (~2–3 days)

### R2.1 Time-range reports at all three levels
> *"tanto dentro del Proyecto, como dentro del bloque y dentro de la partida, se pueda generar un reporte… por el lapso de tiempo que uno indique… mismo Número Único de Registro y el Código QR."*

**Now:** only `/api/partidas/[id]/report`, no time range.
**Fix:** shared report builder (`lib/report/`): scope ∈ {project, bloque, partida} × range `from/to`. Routes: extend partida route with range params; add `/api/projects/[id]/report`, `/api/segments/[id]/report`. Header on every report: obra name, **registrationCode + QR**, range, generated-by, generation timestamp. Content = registros (text, author, GPS, attachments listed), cambios, progress within scope+range. Same auth as the existing partida report.

### R2.2 AI report generator ("Informes")
> *"Generador de Informes con IA vinculado a toda la base de datos del proyecto… formato preestablecido… solicitar por escrito de qué iría… número único y QR… nombre de quien solicitó con su firma debajo y el sello de la compañía."*

**Surface:** new **Informes** tab in the project. User writes the brief (qué va el informe) + picks scope/range. Server assembles the same R2.1 dataset, calls **Claude API** (`claude-sonnet-4-6` default) with a fixed report-format system prompt (secciones preestablecidas: resumen ejecutivo, avance, eventualidades, cambios, recomendaciones), renders the result through the same PDF pipeline.
**Footer:** requester name + their **signature PNG** + **company seal PNG**. If requester has no firma uploaded → prompt to add it (link to Equipo) before generating.
**Persistence:** `Report` model — id, projectId, requestedById, brief, scope, periodFrom/To, contentMd, model, createdAt. Auditable, re-downloadable, listed in the tab.
**Env:** `ANTHROPIC_API_KEY` (Netlify: production-scoped). Generation is server-side only; cost ≈ cents/report (figures in the running-cost breakdown).
**Permissions:** any project member generates; the report records who.
**Implementation note:** read the `claude-api` skill before writing the integration.

---

## R3 — IA reshape (~2–3 days)

### R3.1 Project page: bloques only + media galleries
> *"solo se debe visualizar los bloques Existentes… sin entrar a las partidas… Más abajo… listado general de todas las imágenes… videos… documentos… como archivos de un chat en WS."*

**Fix:** project page = cover+info header → **bloque cards** (name, partida count, progress; click → bloque view with its partidas) → **media galleries**: tabs Fotos / Videos / Documentos / Audio as preview grids (WhatsApp-files style), aggregating all obra attachments, lazy/paginated, click-through to viewer. Existing partida tree moves into the bloque view — nothing is lost, it's one click deeper.

### R3.2 Per-project similarity search
> *"buscador general por similitud (como el de Windows)."*

**Fix:** project-level search box matching partida names, registro text, document titles, cambios (title+description); grouped results with context highlight. Server-side Prisma `contains` v1; pg_trgm index later if volume demands.

### R3.3 Bloque create + delete (double confirmation)
> *"opción de poder crear un Bloque nuevo y también la opción de Borrar algún bloque (con Doble Confirmación)."*

**Now:** create exists (`createSegment`); no delete.
**Fix:** both visible on the project page (R3.1 layout). Delete = double-confirm modal, **empty bloques only** (same immutability policy as obra/partida; non-empty → explain + suggest moving partidas), audited + notified (R0.9).

### R3.4 Dashboard rework
> *"gráfico dual… cantidad de obras activas y archivadas… sirvan como botones… tabla general… (Abajo… las obras activas junto con el buscador)."* + D3

**Fix:** dashboard = **dual chart-buttons** (activas | archivadas; counts; click → general table of that type, sortable: nombre, código, progreso, residente, fecha — ADMIN/MANAGER only for archived per R1.6) → active obras list (now with cover thumbs) + buscador below. Portfolio-wide analytics widgets removed; their home is each project's Analítica (parity check before removal — nothing silently dropped).

### R3.5 Amazon-style partida filters
> *"filtros para el buscador de partidas, así parecido a como los implementa la aplicación de amazón."*

**Now:** `filterPartidaGroups` filters by `q`/`block` only.
**Fix:** faceted filter panel beside the partida list: Bloque (multi), Etiqueta (multi), rango de progreso, con cambios abiertos, rango de fechas. Server-driven via searchParams (shareable URLs), counts per facet.

---

## Cross-cutting

- **Tests:** every authz change (R0.6, R0.7, R0.10, R1.6) gets explicit tests; report builder unit-tested; AI generator tested with a mocked client.
- **Migrations:** R1 adds nullable columns + `registrationCode` backfill (safe, additive). No destructive changes.
- **Storage:** new image kinds (cover, photo, firma, seal) ride the existing storage abstraction + mime allowlist (PNG-only subset for firma/seal).
- **Notifications:** new types — `delete.permanent`, `cambio.resolved` (with feedback). Existing inbox UI reused.
- **Out of scope this round:** Netlify site rename; pg_trgm search index; report email delivery; offline support for galleries.

## Sequencing

R0 → R1 → R2 → R3, each its own `writing-plans` plan + execution pass, landing green before the next. After R3: running-cost breakdown for the user (Netlify, Supabase, R2, Resend, Anthropic API, domain) — explicitly requested, user is fielding acquisition offers.
