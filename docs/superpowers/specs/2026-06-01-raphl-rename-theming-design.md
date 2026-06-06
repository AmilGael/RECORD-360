# Slice A — Rename & Premium Theming (Raphl)

**Date:** 2026-06-01
**Branch context:** `feat/web-m1-core-loop` (M1 core loop already shipped)
**Status:** Approved design, ready for implementation plan

## Context

The app currently ships as **RECORD 360**, an append-only ("black box") site-log
tool for construction. M1 already exists: hash-chained `Registro` ledger,
`Company → Project → Partida → Registro` hierarchy, role-based authz
(`ADMIN/MANAGER/SUPERVISOR/RESIDENT`), media + GPS, ES/EN i18n, a landing page,
and a token-based design system in `web/src/app/globals.css` (warm "concrete
paper" palette, Archivo + Space Mono fonts, orange safety accent).

This slice is the first of a larger redesign ("Raphl"). It is intentionally the
smallest, lowest-risk piece: rename the product and give the existing — already
warm — visual system an editorial-premium lift. It is **not** greenfield; it
evolves what exists. Bigger structural work (information architecture, rich logs,
search, analytics, alarms, enterprise onboarding) is deliberately deferred to
later slices, each with its own spec → plan → build cycle.

## Goals

- Rename **RECORD 360 → Raphl** across every user-visible surface.
- Lift the existing theme to feel premium and editorial while staying legible for
  field use and impressive for executives — one shared design language.
- Do it with minimal churn: no architecture change, no palette migration, no new
  components, no broken imports.

## Non-Goals (explicitly out of scope for this slice)

- **Dark theme.** Light-first. Tokens stay semantically named so a warm-dark
  counterpart drops in later with no rework, but no dark theme is built now.
- **Information architecture / navigation changes** (nested sidebar, media
  sub-tabs, Levantamientos/Ideas/Planos). Later slice.
- **New features** (rich media types, labels/categories, search, analytics,
  alarms, onboarding). Later slices.
- **Logo mark.** Wordmark (text) only. An angel/icon mark is a future branding
  pass.
- **Internal renames.** `package.json` name (`web`), folder names, code module
  paths, and any `record360` identifiers in code/config stay as-is.
- **Seeded demo credentials.** `admin@record360.do` is a real login credential;
  renaming it is a data change that would break the demo. The login hint keeps
  showing the accurate address. Revisit in a future "full rename" slice if ever.
- **Marketing/brand copy rewrite.** The product concept and tagline
  (*"la caja negra de tu obra"* / "BLACK BOX") stay. Raphl is the brand name
  layered over the same product idea; messenger/angel framing is a later pass.

## Design Decisions

### Identity
- Product name: **Raphl** (from Raphael, the messenger angel).
- Wordmark: `Raphl.` set in **Fraunces**. The trailing period uses the existing
  orange accent (`#E14A1F`) — the one accent touch in the mark.
- Audience target: **balanced** across field users, executives, and architects —
  a single design language, with density/depth dialed up for dashboards later
  (not in this slice).

### Visual language — evolve the existing system in place (light-first)
The warm-paper palette and component CSS stay. Four targeted changes:

| Change | From → To | Where |
|---|---|---|
| Display typeface | Archivo 900 → **Fraunces** for wordmark + headings | `globals.css` heading classes; wordmark markup |
| Body/UI + kicker type | **Unchanged** — Archivo (body/UI), Space Mono (kickers/tags) | — |
| Accent color | **Unchanged** — orange `#E14A1F`, deep `#B83814` | — |
| Corner radius | `--radius` 4px → **10px**, add `--radius-sm` ~6px for inputs/tags | `globals.css` tokens |
| Depth | Flat → add `--shadow-soft` / `--shadow-card` tokens; cards get soft shadow | `globals.css` `.card` |

Rationale for keeping orange and the warm palette: it is the strongest existing
brand asset and signals the rugged field-tool character; the serif wordmark,
softer corners, and gentle depth do the "premium" lifting without a risky palette
migration. (Considered and rejected: full shift to a blueprint-gold accent — too
far from the established brand. Considered and rejected: a from-scratch design
system — pure churn for no gain.)

## Scope of Change (files)

User-visible rename + theming touches:

- `web/src/app/layout.tsx`
  - Register **Fraunces** via `next/font/google`, expose as `--font-serif`.
  - `metadata.title`: `RECORD 360 — …` → `Raphl — …`.
- `web/src/app/globals.css`
  - Add `--font-serif` to the `@theme` block.
  - `--radius` 4px → 10px; add `--radius-sm` (~6px) and apply to inputs/tags so
    they don't look puffy.
  - Add `--shadow-soft` / `--shadow-card` tokens; apply soft shadow to `.card`.
  - Apply Fraunces to the wordmark (`.brand b`) and heading classes
    (`.h-xl`, `.h-lg`, `.h-md`).
  - Keep `--accent` / `--accent-deep` unchanged.
- Wordmark markup (the `.brand` element / app bar): set the displayed name to
  `Raphl` and add the trailing orange period.
- `web/src/i18n/dictionaries.ts`
  - `es.common.app` and `en.common.app`: `RECORD 360` → `Raphl`.
  - Any other visible "RECORD 360" copy in both locales.
  - Login demo hint: leave the `admin@record360.do` address accurate (credential
    unchanged).
- `landing/index.html` — visible brand name + `<title>`; currently untracked, so
  `git add` it as part of this slice.
- `README.md` — headline rename.

## Verification

Predominantly visual + string changes:

1. `npm run build` (Next) and `npm run lint` (eslint) pass.
2. A grep asserts no user-visible "RECORD 360" / "RECORD-360" remains in the
   in-scope surfaces (i18n dictionaries, `layout.tsx` title, `landing/index.html`,
   `README.md` headline). The seeded `record360.do` email is the only allowed
   remaining reference.
3. Manual visual pass of the four surfaces — **landing, login, dashboard, partida
   feed** — in **both ES and EN**, confirming: Fraunces wordmark with orange dot,
   Fraunces headings, 10px radius, soft card shadows, orange accent intact, and no
   layout regressions from the radius/shadow changes.

## Sequencing note

This is slice A of the decomposed "Raphl" redesign. Suggested next slices (each
its own spec → plan → build): C — rich logs + labeling; B — information
architecture; D — search; E — roles; F — analytics; G — alarms; H — enterprise
onboarding.
