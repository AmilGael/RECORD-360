# RECORD-360 Maturity Plan — Codebase-Reconciled Spec

Source: product plan supplied 2026-07-28 (17 sections). This spec reconciles it against the deployed codebase (`main @ 1b1ea51`) so phases plan only what is actually missing. Design direction (§1) and non-goals (§16) are adopted verbatim as constraints.

## Global constraints (apply to every phase)

- Preserve the existing visual language: current typography stack, palette tokens, repo-card/list/badge idioms, sidebar + workspace concepts, Sites → Blocks → Work Items → Logbook hierarchy. No new visual framework, no client-side UI libraries.
- NO emoji in UI — monochrome SVG line icons (`components/icons.tsx`) or text only.
- es/en dictionaries must stay shape-identical (`dictionary-labels.test.ts` enforces this); every new string lands in both.
- Color is never the only signal; text labels accompany severity markers.
- Motion: compositor-friendly properties only (opacity/transform); `prefers-reduced-motion` already globally honored — keep it that way. The two waived layout transitions (padding-left hover nudge, progress width) stay as-is per `.impeccable/config.json`.
- New tables in migrations MUST add their own `ENABLE ROW LEVEL SECURITY` line. `prisma migrate dev` is broken (RLS checksum drift) — hand-write migrations, apply with `migrate deploy`.
- Server is the authorization boundary; UI visibility is never authorization.
- Do NOT add (per §16): Gantt/critical-path, budgeting/invoices/payments, payroll/timecards, procurement/inventory, equipment, RFI/submittal systems, inspection/safety form builders, client billing/selections.

## Reconciliation: plan section → current state

| § | Item | Status | Notes |
|---|---|---|---|
| 1 | Design direction | ✅ constraint | Adopted; nothing to build |
| 2 | Quality bar | ✅ mostly shipped | States for offline/retry/archived/closed/reopened/AI-pending all exist and are tested; gaps folded into phases below |
| 3 | Sidebar Tools group | 🆕 Phase 2 | Requests/Documents/Reports/Activity as cross-project routes do not exist yet (they are §9 features); the collapsible group ships with its first real member |
| 3 | Pending count badge | ✅ shipped | `countPendingItems` badge in sidebar |
| 4 | Top utility bar | 🆕 Phase 2 | No top bar exists in the app shell today. Needs a design decision: global search backend (no cross-entity search API exists) — start with project search + nav shortcuts, grow later |
| 5 | Sites/portfolio depth | 🟡 partial → Phase 4 | Search/filters/progress/archived mgmt/collapsible New Site/visibility all shipped; missing: owner+resident+latest-activity on cards, critical/overdue counts per project |
| 6 | Project section bar | 🟡 partial → Phase 2 | Tabs exist (Partidas/Planos/Solicitudes/Analítica/Informes). "More" menu (Activity, Project Team, Recycle Bin, Settings, Archive) is new; team/archive/purge controls currently live inline on the page header |
| 7 | Project overview | 🆕 Phase 4 | Today the default tab is the workspace; a summary view (owner, description, QR, progress, blocks, criticals, recent activity) is new |
| 8 | Block workspace | 🟡 partial → Phase 2 | Context preservation, lifecycle header, Solicitudes — shipped. New: consolidate doc spaces (Planos/Levantamientos/Ideas) under a "Documentos" section with categories incl. Minutas/Otros (needs 2 new DocumentKind values), rename Cuaderno→keep (it IS the Logbook) |
| 9 | Cross-project sections | 🆕 Phase 5 | All seven views new; all derivable from existing tables (ChangeRequest, Document, Informe, AuditLog, Registro.reminder*, ProjectAssignment, signatures/hashes). Calendar = agenda over existing reminders ONLY |
| 10 | Phone-first | 🟡 partial → **Phase 1** | Wrap/overflow/i18n-resilience shipped app-wide. Missing: drawer sidebar (<1040px currently stacks a full-height sidebar above content), tab overflow-scroll, table→cards, filter sheet, safe-area, 44px touch targets, viewport audit |
| 11 | Translation resilience | ✅ shipped | `font:inherit`, `min-width:0`, wrap sweep, es/en parity test. **French is NEW scope** — a third locale is a large dictionary effort; needs an explicit go/no-go (see Decisions) |
| 12 | Transitions | ✅ mostly shipped | Motion system already restrained + reduced-motion; Phase 3 = audit pass, not new system |
| 13 | Interaction-state system | 🟡 partial → Phase 3 | Most states exist; missing `loading.tsx` for pending/notifications/admin; standardize error copy shape ("what happened + next action") |
| 14 | Accessibility | 🟡 partial → Phase 1/3 | focus-visible, labels, role=alert/status, text-with-color shipped; touch targets and drawer/menu a11y land with Phase 1; landmarks/heading audit in Phase 6 |
| 15 | Performance | 🟡 partial → Phase 3/4 | Pagination exists (notifications, feed); loading placeholders partial; filter/context preservation shipped for spaces & notifications |
| 16 | Non-goals | ✅ constraint | Adopted verbatim |
| 17 | Phases | — | Mapped below |

## Decisions needed before their phase starts (not blocking Phase 1)

1. **French locale (§10/§11)** — third dictionary (~1000 keys), PDF/report language policy (informes are Spanish by product decision), and ongoing triple-maintenance. Recommend: defer until a French-speaking market is real; Phase 1 tests es/en only.
2. **Global search scope (§4)** — no cross-entity search index exists. Recommend v1 = projects + partidas by name (two indexed queries), grow per demand.
3. **Documents categories (§8)** — Minutas/Otros need new `DocumentKind` enum values (additive migration). Confirm the category list before Phase 2.
4. **"More" menu contents (§6)** — moving Archive/Purge controls off the page header into More changes a flow the architect just reviewed; confirm after his pass.

## Phase map (each phase gets its own plan file when it starts)

- **Phase 1 — Responsive foundation**: plan at `docs/superpowers/plans/2026-07-28-phase1-responsive-foundation.md` (written).
- **Phase 2 — Navigation & context**: Tools group + utility bar + section-bar "More" + Documents consolidation. Blocked on decisions 2–4.
- **Phase 3 — Motion & interaction quality**: audit pass over transitions, missing loading states beyond Phase 1's, error-copy standardization.
- **Phase 4 — Core page depth**: Sites cards enrichment (owner/resident/last-activity/critical counts), Project overview tab.
- **Phase 5 — Cross-project views**: Requests, Documents, Reports, Activity, Agenda, Team workload, Verification — one PR per view, each reusing existing queries (`projectAccessWhere` everywhere).
- **Phase 6 — Validation**: role/mobile/translation/a11y/volume/AI/perf test matrix; reuse the audit method from `2026-07-27` audits.

## Acceptance (verbatim from source plan)

Immediately recognizable as RECORD-360; more capable, structured, faster, smoother, easier to navigate, more informative, reliable on phones, resilient across languages, suitable for enterprise use.
