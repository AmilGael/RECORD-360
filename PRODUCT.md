# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Site Resident / Field Supervisor (primary):** feeds the system daily from the construction site, under pressure, in harsh conditions (dust, gloves, bright sunlight, basements with no signal). Hates typing long paragraphs on a phone. Needs registration in under 30 seconds, offline mode, voice-friendly capture, and clear pending-task cues.
- **Project Supervisor / QA:** validates reported information and approves work without being on site constantly. Needs audit trails, change-request review, and robust search.
- **Project / Construction Manager:** makes strategic and financial decisions from the office. Needs the health dashboard, risk visibility, and cost control on extra work.
- **HR / Payroll Administrator:** needs clean attendance data and document-expiry visibility (secondary; not fully built).

Audience is the construction sector in the Dominican Republic — architects and construction company owners as buyers, field staff with varying digital literacy as daily users. Spanish is the primary language; the UI is bilingual (es/en) with Spanish canonical.

## Product Purpose

Raphel is a "black box" for construction sites: it turns the passive paper logbook into an immutable, real-time record of what happened on the obra — who did what, when, where, with photo evidence. It exists to give construction companies legal protection, operational visibility, and financial recovery (billing extra work that would otherwise go undocumented).

**Current goal (confirmed 2026-07-27): win paying Dominican Republic clients.** The app and the landing page are sales tools; success in the next few months is signed subscriptions from DR construction companies.

## Positioning

"Version control for construction" — GitHub's workflow structure (repos → obras, commits → registros, pull requests → solicitudes de cambio) wearing a construction-Spanish skin, never dev vocabulary. A lightweight, affordable, legally robust alternative to heavy foreign platforms (Procore, Autodesk) that is built for local reality: intermittent connectivity, mid-range Android phones, high staff turnover, and legal validity under Dominican Law No. 126-02 (electronic commerce and digital signatures).

The claim a neighbor cannot truthfully copy: an append-only, server-timestamped, geotagged record designed around DR field conditions and DR law, at local-market pricing.

## Operating Context

- Construction sites in the DR: intermittent or no internet, bright sun, gloves, dust; entries are made standing up between tasks.
- Office side: managers review dashboards and approve change requests from a desktop browser.
- The product replaces paper logbooks and informal WhatsApp threads as the system of record.
- Commercial context: per-company monthly subscription (+ ITBIS; annual prepay = 2 months free). See `docs/business/2026-06-11-raphel-business-dossier.md` and `docs/business/2026-06-11-raphel-propuesta-comercial.md`.

## Capabilities and Constraints

Operational today (the `web/` Next.js 15 app, deployed on Netlify as a PWA):

- Auth with access-request onboarding, activation, and password reset (NextAuth v5).
- Hierarchy: Obra (site) → Bloque (segment) → Partida (work item) → Registro (entry with notes/photos).
- Cuaderno (log feed), change requests (Cambios: Abierta → Integrada / Rechazada), Analítica dashboard, PDF export (pdfkit), QR codes.
- Offline-first capture: IndexedDB queue (`raphl-offline`) with background sync.
- Media storage on S3-compatible R2; AI features via the Anthropic SDK.

Constraints future work must preserve:

- **Terminology canon is locked** (`web/src/i18n/dictionaries.ts`): Obra, Bloque, Partida, Registro, Cuaderno, Sello, Planos (= uploaded plan files), Cambios, Analítica. Borrow GitHub's structure, never its vocabulary — dev jargon in UI labels is a bug.
- **Internal identifiers deliberately keep the old `raphl` spelling** (`raphl:` event names, `raphl-offline` IndexedDB, `raphl-record360` Netlify site) — renaming them would orphan users' offline queues.
- Append-only records: corrections are new linked entries, never edits or deletes.
- Must run well on mid-range Android devices over weak connections; entry creation in ≤3 taps / under 30 seconds.
- Prod DB is Supabase (RLS deny-all on every public table; new tables must enable RLS), dev is Neon; CD on `main` runs `migrate deploy`.

Open decisions (recorded, not invented): digital signatures under Law 126-02 are spec'd but deferred; HR/attendance module not built; voice dictation is a PRD commitment not yet shipped.

## Brand Commitments

- **Name: Raphel** (confirmed 2026-07-27). The June 2026 rename stands; remaining "Raphl"/"RECORD-360" user-visible strings (landing page title, README) are legacy debt to update, not alternatives.
- **No emoji anywhere in the UI** — monochrome SVG line icons or text only (owner rule).
- Spanish-first bilingual UI; the `Dict` type derives from `es`.
- Voice: sober, legally credible, construction-literate — the record must feel inalterable, not playful.

## Evidence on Hand

- **Real project data:** at least one real construction project has genuine entries and photos in the system (confirmed 2026-07-27). Usable for demos/screenshots with owner approval per project.
- **Architect endorsement:** the advising architect (Victor Manuel Acevedo, PRD co-author) can be named and quoted (confirmed 2026-07-27).
- Business dossier with cost/pricing model and a commercial proposal in `docs/business/`.
- Detailed architect feedback rounds in `docs/superpowers/specs/` (2026-06-05 analysis, 2026-06-11 round 2).
- **Absent — never fabricate:** paying-customer logos, testimonials beyond the architect, usage metrics, press.

## Product Principles

1. **The record is sacred.** Immutability, server timestamps, and geotags are the product; nothing may weaken the "black box" claim.
2. **Under 30 seconds, one thumb, no signal.** Field capture wins or loses the product; every field-facing decision optimizes for speed, offline, and gloves.
3. **GitHub's structure, the obra's language.** Workflow patterns come from version control; every visible word comes from construction Spanish.
4. **Legally credible by design.** Features and copy must survive a lawyer's reading under Law 126-02; no claims the system cannot back.
5. **Lightweight beats complete.** Prefer the affordable, focused tool over feature parity with Procore.

## Accessibility & Inclusion

- High legibility in direct sunlight; large touch targets usable with gloves.
- Low assumed digital literacy for field roles: minimal typing, recognition over recall.
- Must perform on mid-range Android hardware with minimal battery drain.
