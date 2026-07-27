# R3 Architect-Feedback Remediation — Final Deliverables

**Branch:** `feat/architect-feedback-r3` · **Base:** `ec5aa91` · **HEAD:** `fe673a2` (21 commits)
**Contracts:** [2026-07-27-r3-shared-contracts.md](2026-07-27-r3-shared-contracts.md) · **Ledger:** `.superpowers/sdd/progress.md`
**Execution:** lead agent + 4 domain agents, each gated by an independent spec+quality review, then a whole-branch cross-cutting review.

---

## 1. Validation Matrix

Every reported item was inspected in code before any change. Classification legend: **CD** confirmed defect · **MF** missing feature · **PI** partially implemented · **UX** UX deficiency · **DM** data-model limitation · **AR** ambiguous requirement (resolved by lead decision).

| # | Reported item | Reproduced? | Root cause (evidence) | Class |
|---|---|---|---|---|
| WS1 | "Pending items" view | Yes | `PendingEntries` is the **device-local IndexedDB** capture queue scoped to one partida (`components/pending-entries.tsx`); no server-backed operational queue existed anywhere. The report conflated two different domains. | MF |
| WS2A | Team profile text overlap | Yes (structural) | Single flex row with avatar+identity+role+date+form+actions, **no `flex-wrap`**, no truncation, edit form squeezed inline (`app/admin/page.tsx`). | UX |
| WS2B | Archive user profiles | Yes | `User.disabledAt` existed but **no action ever set it**; no assignment teardown, no audit, no notification. | MF |
| WS2C | User signatures | Yes | Upload existed but limits invisible, client/server validation not aligned, no preview, no audit on replace (`member-profile-form.tsx`). | PI |
| WS3 | Notification coverage/search/severity | Yes | Ad-hoc `type` strings per action; page fetched a bounded list and filtered **in memory**; no search, no severity, no project filter. | PI |
| WS4A | Project owner + description | Yes | No owner field on `Project`; the description input's placeholder ("Av. Winston Churchill…") pushed users to store an **address** in the general description. | MF + DM |
| WS4B | Archive helper text | Yes | Explanatory sentence above the archive control on the project page. | UX |
| WS4C | Close/reopen blocks | Yes | `Segment` had no lifecycle columns; nothing prevented partidas in a "finished" block. | MF |
| WS4D | Broken change/image/reminder submission | Yes | **Three distinct causes:** (a) `createChangeRequest` threw plain `Error`s from a `<form action>` — Next.js **masks** thrown server-action messages in production, so every validation failure looked like a generic crash; (b) GPS silently stored `null`; (c) offline reminders → see WS10. | CD |
| WS4E | Contextual block UI | Yes | Block-creation control and a redundant block selector rendered **inside** a block workspace. | UX |
| WS4F | Spaces navigation | Yes | The workspace activates a block from `?block=`, but `bloque-spaces-panel`'s `href()` emitted **`?spaceBlock=`** — every space link silently dropped block context. | CD |
| WS4G | "Changes" → "Requests" | Yes | Umbrella term "Cambios" throughout; routes `/cambios`. | UX |
| WS5 | Request kind + severity + GPS | Yes | `ChangeRequest` had neither kind nor severity; GPS was optional and unvalidated (one-sided coords accepted). | MF + DM |
| WS6 | Analytics colors | Yes | `healthLevel(progress)` drove red/yellow/green dots **and** phase labels purely from percentage (`analitica-tab.tsx`) — low progress rendered as "risk". | CD (design) |
| WS7 | Report archetypes | Yes | `Informe` had a free-text brief only; one fixed prompt for all audiences. | MF |
| WS8 | Partida lifecycle | Yes | `parseProgressPct` accepted 0–**100**; no completion state; 100% was indistinguishable from "concluded". | MF + DM |
| WS9 | Voice dictation | Yes | **Environment-level root cause found at integration:** `Permissions-Policy: microphone=()` denied the mic on **every** origin including production (`lib/security-headers.ts`). Application-level: no unsupported state, undifferentiated errors, no unmount cleanup. | CD |
| WS10 | Offline reminders stuck in retry | Yes | `parseReminderDueAt` rejects any reminder >60s in the past → an offline capture synced **after** its reminder time got a permanent 400; `sync.ts` mapped every non-401 failure to a terminal `"error"` with no user-actionable distinction. | CD |
| WS11 | PDF label + company seal | Yes | Label said "Exportar PDF"; the seal rendered **only** on the informe path, never on deterministic exports; plus a **latent pre-existing bug** — the page-number loop calls `switchToPage()` without `bufferPages: true`, which throws once a document exceeds pdfkit's flush window. | CD |
| — | Local dev fully de-hydrated | Yes (integration) | CSP lacked `'unsafe-eval'`, which Next.js react-refresh requires in development → **every client effect dead locally**, masking all client-side behavior under test. | CD |
| — | `prisma migrate dev` broken | Yes (Phase 1) | The RLS migration's unguarded `ALTER TABLE "_prisma_migrations"` fails shadow-DB replay (P3006) — no schema change had been possible since it landed. | CD |

**Not reproducible / already resolved:** none of the reported items were false. Two reported symptoms resolved to *different* causes than implied: "broken submission" was largely error **masking**, not failure; the dashboard's "red bar" was the accent progress fill at 13%, not a health color.

---

## 2. Architecture Summary

**Enums (new).** `RequestKind {CHANGE, ALERT}` · `RequestSeverity {IMPORTANT, CRITICAL}` · `InformeArchetype {OWNER, SENIOR_MANAGEMENT, PERSONAL_FEEDBACK}` · `NotificationSeverity {SUCCESS, IMPORTANT, CRITICAL}`.

**Lifecycle states.**
- *Partida:* `completedAt == null` ⇒ open. Conclude sets `progressPct=100`, `completedAt/ById`, and snapshots `priorProgressPct`. Reopen restores `min(priorProgressPct ?? 99, 99)`. **Manual progress is 0–99 on every writer**; 100 is reachable only through Conclude.
- *Block (Segment):* `closedAt == null` ⇒ open. Close requires every non-deleted partida concluded (empty block may close — documented decision); a closed block rejects new partidas and rejects partida reopen.
- *User:* `disabledAt` is the archival state. Archive = one transaction (set `disabledAt` + delete assignments + audit with the assignment snapshot). Restore never restores assignments.
- **Concurrency contract:** every transition derives "did I actually change it" from a **guarded write inside the transaction** (`updateMany … WHERE <precondition>` or raw `UPDATE/INSERT … WHERE NOT EXISTS`), and only the winner writes audit and notifies. This is what makes double-clicks, retries, and SERIALIZABLE aborts safe.

**Notification event policy** (`lib/notifications/events.ts`) — one typed helper `notifyEvent()`; no action writes notification rows directly. 13 canonical keys (`block.*`, `partida.*`, `request.*`/`alert.created`, `reminder.resolved`, `user.archived`), stored in both `eventKey` and `type`; `LEGACY_TYPE_ALIASES` maps historical `cambio.*` rows so filters stay correct across the rename. Severity: SUCCESS for completed/resolved/reopened; IMPORTANT/CRITICAL mirror the request's own severity; null = informational. **Color is never the only carrier** — every marker renders a text label. Recipients: company-scoped, actor excluded (opt-in `includeActor` for creator confirmations), disabled users excluded, ADMIN+MANAGER plus project-assigned users, deduped, never cross-company.

**Pending-item model** (`lib/notifications/pending.ts`) — a read-only **projection**, not a table: OPEN `ChangeRequest`s (kind → `request`/`alert`, carrying their own severity) ∪ unresolved registro reminders (`reminderDueAt` set, `reminderResolvedAt` null; IMPORTANT, escalating to CRITICAL when overdue). Each item exposes a stable prefixed id (`req:`/`rem:`), type, project, title, severity, timestamps, author, and deep link. Sorted CRITICAL → overdue → IMPORTANT → newest. Scoped by `projectAccessWhere`, so residents see only assigned projects. Resolved items simply stop matching — rows persist historically. **This is strictly separate from the offline IndexedDB queue**, which keeps its own "Pendientes de sincronización" surface.

**Offline error taxonomy** — `pending` (auto-retryable: network/5xx) · `blocked` (401, resolves after login) · `error` (terminal: 403 access, 400 validation, with the real server message shown).

---

## 3. Implementation Summary

| Area | Key files | Why |
|---|---|---|
| Schema + migration | `prisma/schema.prisma`, `migrations/20260727090000_r3_lifecycle_requests/` | All new enums/columns in one additive migration |
| Event policy | `lib/notifications/events.ts`, `create.ts` | Single emission point; severity + recipient policy |
| Lifecycle | `actions/lifecycle.ts` (new), `actions/partida-progress.ts`, `actions/admin.ts`, `lib/registro/append.ts`, `lib/project/segments.ts` | Conclude/reopen/close/reopen + archival + progress caps on **both** writers; `resolveSegment` returns `{id, created}` so only the true creator notifies |
| Pending queue | `lib/notifications/pending.ts`, `app/app/pending/`, `actions/reminders.ts`, `components/app-sidebar.tsx`, `app/app/layout.tsx` | Server-backed operational queue + count badge |
| Notification UX | `lib/notifications/query.ts`, `app/app/notifications/page.tsx`, `components/severity-marker.tsx` | DB-level search/filter/pagination with legacy aliases |
| Requests | `actions/cambios.ts`, `lib/cambios/validate.ts`, `components/cambios-create.tsx`, `cambios-list.tsx` | kind/severity/GPS server-enforced; visible form errors via `useActionState` |
| Navigation | `lib/project/space-links.ts` (new), `components/bloque-spaces-panel.tsx`, `project-file-tree.tsx`, `bloque-cards.tsx` | Canonical `block` param; contextual creation; block lifecycle UI |
| Analytics | `components/analitica-tab.tsx` | Neutral accent bars; `is-done` driven by real `completedAt`, not by percentage |
| Team/capture | `app/app/admin/page.tsx`, `components/member-profile-form.tsx`, `log-composer.tsx`, `lib/capture/dictation.ts` | Responsive rows, archival controls, signature UX + audit, dictation state machine |
| Offline | `lib/offline/{types,sync}.ts`, `api/offline/registros/route.ts`, `lib/registro/validate.ts`, `components/pending-entries.tsx` | Error taxonomy + `parseOfflineReminderDueAt` |
| Reports/PDF | `lib/report/pdf.ts`, `lib/report/seal.ts`, `lib/informes/{prompt,archetypes}.ts`, `components/informes-tab.tsx`, 4 export routes | Archetypes; seal on every page via `pageAdded` + reserved bottom band; `bufferPages` fix |
| Environment | `lib/security-headers.ts` | Dev-only `unsafe-eval`; `microphone=(self)` |

---

## 4. Migration Summary

**`20260727090000_r3_lifecycle_requests`** — additive only: 4 `CREATE TYPE`, then `ADD COLUMN` on Project/Partida/Segment/ChangeRequest/Informe/Notification, plus one index.

- **Backfill:** none required. Every new column is nullable except `ChangeRequest.kind`/`severity`, which carry DB defaults (`CHANGE`/`IMPORTANT`) so existing rows are valid immediately. The *form* still requires an explicit choice — the default exists only for history.
- **Semantics for legacy rows:** partidas/blocks default to open; `Informe.archetype = NULL` renders "Informe anterior (sin audiencia)"; `Notification.eventKey = NULL` marks pre-rename rows, handled by `LEGACY_TYPE_ALIASES`.
- **Reversibility:** drop the columns and types; no data transformation to undo.
- **RLS:** no new tables ⇒ no new `ENABLE ROW LEVEL SECURITY` statements. New columns inherit their table's existing policy.
- **Also shipped:** the RLS migration's `ALTER TABLE "_prisma_migrations"` is now wrapped in an existence guard. `migrate deploy` matches applied migrations **by name** and does not re-verify content, so production is unaffected; the guard only repairs shadow-DB replay for future `migrate dev`.
- **Deployment order:** standard — `prisma migrate deploy` (already wired into the production Netlify build) then the app. No coordination window: old code tolerates the new columns (it ignores them) and new code tolerates old rows (all nullable/defaulted). **Verified:** `prisma migrate status` → up to date, 28 migrations.

---

## 5. Test Report

| Gate | Command | Result |
|---|---|---|
| Unit + action/API tests | `npm test` | **497 passed / 497** (91 files) — up from a 359 baseline (**+138**) |
| Type check | `npx tsc --noEmit` | **Clean** (the long-standing `partida-facets.test.ts` error was fixed in `5fa3446`) |
| Lint | `npm run lint` | **0 errors** |
| Production build | `npm run build` | Compiles; all routes generate |
| Migrations | `prisma migrate status` | Up to date; `migrate dev` shadow replay repaired |

**Coverage added** (representative): conclude/reopen transitions incl. `Promise.all` concurrency regressions asserting exactly one audit row and one notification batch; block-close prerequisites (open partidas rejected, empty allowed); closed-block partida rejection; progress rejects 100 and rejects concluded partidas; archival transaction (disabledAt + assignments removed + audit + one notification per assignment), self-archive blocked, cross-tenant collapse to generic Forbidden, idempotent re-archive; **archived user cannot be re-assigned** (final-review fix); request kind/severity validation; GPS validation across 11 cases including one-sided and out-of-range; notification search/filter/pagination incl. legacy-alias matching across pages; pending projection tenant isolation and RESIDENT assigned-only visibility; reminder resolution idempotency; offline sync taxonomy per status code; past-due offline reminder accepted end-to-end while the online path still rejects; archetype prompts materially distinct; **seal image count == page count** on multipage PDFs.

**Browser validation** (dev server, seeded admin): dashboard; `/app/pending` with severity markers, filters, pagination, deep links; notifications filter bar; "Solicitudes" rename; request form with unchecked kind/severity radios and GPS "Obteniendo ubicación…" with submit disabled until acquired; canonical `?block=` preserved alongside `?p=`; block workspace without in-block block creation; partida page showing "Concluir partida" and "Exportar Registro de Avance"; team page restructured rows with Archivar absent on self; analytics neutral bars with no phase labels.

**PDF validation:** the partida route returned a valid multi-page PDF (200, `application/pdf`); a 3-page sealed build was rasterized and inspected — header, QR, body text, page numbers and the seal band are all clear of each other. The reviewer additionally ran a content-stream scan over a 26-page worst-case document: **657 text-positioning ops, zero inside the seal band**, one seal stamp per page.

**Unresolved failures:** none. **Substitutions:** mobile-width screenshots could not be captured (macOS fullscreen blocked window resizing; `frame-ancestors 'none'` rules out iframe emulation) — responsive behavior was verified structurally instead, and a manual phone check is carried as residual risk R1. GPS "acquired" and live dictation could not be exercised in automation (no mock geolocation/microphone); their state machines are unit-tested and the disabled-until-acquired gate was observed.

---

## 6. Residual-Risk Register

| ID | Risk | Severity | Mitigation / status |
|---|---|---|---|
| R1 | Responsive layouts unverified on a real handset (automation could not resize) | Medium | Structural review passed; **do a manual pass on a phone before field rollout** — this is the primary daily surface |
| R2 | `notifyEvent` after an already-committed create can surface an error for a successful write, inviting a duplicate resubmit | Low | Ticketed; wrap as best-effort like the existing mailer |
| R3 | `resolveSegment` name-based match: a rename racing a stale page could create a duplicate block | Low | Ticketed |
| R4 | Aggregate progress rounds to 100% and renders green on bloque cards / dashboard while a partida is unconcluded | Low | Align with `analitica-tab`'s strict stance |
| R5 | `syncQueue` re-POSTs terminal-error items each run (idempotency key prevents duplicates; wasted requests only) | Low | Filter terminal states out of the retry loop |
| R6 | `partida.deleted` event key defined but unemitted; legacy `delete.permanent` rows unfilterable by type | Low | Adopt on next touch of the deletion flows |
| R7 | Dictation quality depends on browser Web Speech support; `es-DO` may fall back | Medium | Unsupported state is explicit; an audio-upload+transcription fallback is a separate evaluation |
| R8 | Mandatory-seal reversal (`fe673a2`): exports now **409** when no company seal is configured | **Product decision** | Every tenant must upload a seal before any PDF export works. Confirm this is intended before rollout |
| R9 | `ownerName` is create-only — no edit path for a typo | **Product decision** | Add an edit control or accept DB-side correction |
| R10 | Signature size limit (8 MB PNG) is mirrored manually between client and a module-private server constant | Low | Export the constant |

---

## 7. Acceptance Matrix

Legend: ✅ implemented · 🧪 automated test · 👁 manually verified in browser/PDF · ⏸ deferred · ❓ product decision.

| WS | Requirement | Status |
|---|---|---|
| 1 | Server-backed operational queue (requests/alerts/reminders), normalized fields, deep links | ✅ 🧪 👁 |
| 1 | Authorization-scoped, sorted CRITICAL→overdue→IMPORTANT→newest, filterable | ✅ 🧪 👁 |
| 1 | Resolution persists atomically, leaves the queue, audits, notifies; history preserved | ✅ 🧪 |
| 1 | Offline captures kept separate under "Pendientes de sincronización" | ✅ 👁 |
| 2A | Responsive team layout, truncation with accessible full values, edit below row | ✅ 👁 (R1: handset pending) |
| 2B | Archival: transaction, assignment teardown, audit, per-assignment notifications, revoked access | ✅ 🧪 |
| 2B | Archived excluded from selectors; restore never restores assignments | ✅ 🧪 (final-review fix) |
| 2C | Signature limits visible, client/server aligned, preview, audit, preserved on unrelated edits | ✅ 🧪 |
| 3 | 13 typed events via one policy; legacy aliases; severity + text labels | ✅ 🧪 |
| 3 | DB-level search/filters/pagination (no in-memory filtering) | ✅ 🧪 👁 |
| 3 | Recipient correctness, no cross-tenant, no disabled users, no duplicates on retry | ✅ 🧪 |
| 4A | Project owner field + general description displayed; description ≠ address | ✅ 👁 / ❓ R9 (no edit path) |
| 4B | Archive helper text removed, control + confirmation intact | ✅ 👁 |
| 4C | Block close/reopen with all-concluded precondition, closed blocks reject partidas | ✅ 🧪 👁 |
| 4D | Real server errors surfaced; GPS never silently null; offline reminder path fixed | ✅ 🧪 👁 |
| 4E | No block creation inside a block; implicit segmentId; server still validates ownership | ✅ 👁 |
| 4F | Canonical `block` param everywhere; context preserved | ✅ 🧪 👁 |
| 4G | "Solicitudes"/"Requests" terminology; routes unchanged | ✅ 👁 |
| 5 | `RequestKind` + mandatory `RequestSeverity`, migration default for history | ✅ 🧪 |
| 5 | Mandatory automatic GPS with full state machine + server range validation | ✅ 🧪 👁 (acquired state: unit-tested only) |
| 5 | Resolution preserves actor/time/note, notifies author + stakeholders, 4-eyes retained | ✅ 🧪 |
| 6 | Progress-derived red/yellow/green and phase labels removed; green = completed only | ✅ 👁 (R4 edge) |
| 7 | Required archetype, persisted, three materially distinct prompts, shown in history + PDF | ✅ 🧪 |
| 8 | Manual progress 0–99 on all writers; 100 only via Conclude | ✅ 🧪 |
| 8 | Conclude/reopen authorized, idempotent, audited, notified, revalidated | ✅ 🧪 👁 |
| 9 | Unsupported state, differentiated errors, text preserved, single instance, unmount cleanup | ✅ 🧪 |
| 9 | Microphone actually permitted (Permissions-Policy fix) | ✅ 👁 / ⏸ R7 live capture |
| 10 | Retryable vs blocked vs terminal taxonomy with real reasons in the UI | ✅ 🧪 |
| 10 | Delayed offline reminder accepted per policy; online path unchanged | ✅ 🧪 |
| 11 | "Exportar Registro de Avance" label; filename/content-type unchanged | ✅ 👁 |
| 11 | Company seal on every page of every export; no overlap; multipage verified | ✅ 🧪 👁 |
| 11 | Missing-seal policy | ✅ / ❓ R8 (now blocks export — confirm) |
| X | Tenant isolation, transactions/idempotency, auditability, es/en parity, no emoji | ✅ 🧪 |

**Not delivered:** nothing from the brief was dropped. Two items are flagged for a product call rather than engineering (R8 mandatory seal, R9 owner edit), and one verification channel (handset) remains open as R1.
