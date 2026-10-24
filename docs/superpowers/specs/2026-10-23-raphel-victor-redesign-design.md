# Raphel visual redesign from Victor's requests (design)

Date: 2026-10-23. Status: draft for approval. Sources: `victor_design_structured.md` (compiled 2026-10-20 from the 10-12 Notion meeting and Victor's 10-20 WhatsApp screenshots), the Daisy Collection back-office in `~/Mirror/Daysi-Collection-Website-` (tabs and side sheet), and the decisions Gamaliel made in the 2026-10-23 brainstorm.

The spec page Victor's team built (`raphel-build-spec-victor-redesign-3sor.pages.grok.bot`) sits behind a Grok sign-in and was not read. Its screenshots may add detail this document lacks; anything it contradicts wins.

## Intent and why

Victor, the product owner, sent a full visual redesign on 2026-10-20. He wants the app simpler and more attractive, in its original colors, with big project imagery and card-based partidas. Gamaliel wants the navigation to work like the Daisy Collection back-office: a strip of real-route tabs and a panel that slides in from the right. The app is a sales tool for Dominican construction companies, and Victor is showing it to a pilot client and at a February launch, so the first impression matters more than new features.

## Goals

1. Apply every screen change Victor listed (see "Screens").
2. Replace the project's `?tab=` links with a Daysi-style tab strip of real routes.
3. Add one reusable slide-in side sheet, used for the Partida preview, the new-Solicitud form, and the new partida/bloque forms.
4. Return to the original look: warm palette, fine grid ground, rounded corners, soft shadows.
5. Keep Spanish and English both fitting (Spanish runs 20-30% longer).

## Non-goals

- New features from the meeting that are not in the screenshots: materials and delivery tables, budget import, AI reports in three formats, new analytics metrics (Victor will choose those himself).
- Redoing what already shipped and works: back button (#21), Partidas preview content (#22), Planos thumbnails and search (#24), seen/unseen notifications (#25). These get restyled and moved into the new patterns, not rebuilt.
- Digital signatures, Change Orders, HR.
- Changing the notebook (cuaderno) or the registro composer. Victor said the notebook stays as it is.

- Restyling the public landing page and the login/activation/reset screens (Gamaliel, 2026-10-23: "app only, for now"). The original look applies inside `/app`. Because the current tokens live in `:root` and `body[data-theme]` and the landing overrides them with a scoped `.lp-night` class, the builder must scope the new tokens so the landing and the auth screens keep rendering exactly as today (for example under the `/app` layout), and check each of those screens before and after.

## Anti-goals

- No staged-edit "Confirmar" bar on log records. Records are append-only; a draft that can be discarded does not belong there. The side sheet closes without a confirm bar.
- No emoji; monochrome SVG line icons or text only (owner rule in `PRODUCT.md`).
- No hue-only state. Status keeps a text label next to any color.
- No breaking the locked terminology (Obra, Bloque, Partida, Registro, Cuaderno, Planos, Cambios, Analitica).
- No orphaning of the `raphl-offline` IndexedDB queue or other legacy `raphl` identifiers.

## Constraints

- Next.js 15 app in `web/`, Prisma, prod on Supabase (RLS deny-all on every public table), dev on Neon. Any new table must enable RLS in its migration. This design needs no new table.
- Must work on mid-range Android over weak connections and offline-first capture must keep working.
- Existing project cover image: `Project.coverImageKey`, served from `/api/media/<key>`, already uploaded at project creation. Today it shows as a 28px or 52px thumbnail.

## Decisions (Gamaliel unless marked)

### Look (reverses `DESIGN.md`)

The "full original look" (palette recovered from git before commit 2dff366):

- Night: ground `#171412`, planes `#1f1b18`, `#292420`, ink `#f1e7d8`, soft ink `#d4c7b7`, steel `#b5a998`, accent `#ff6f43` (deep `#e85a2c`), state colors green `#5bbd8d`, violet `#a388e4`, red `#e06a54`, hairlines at 12% and 22% ink.
- Day (my call): paper `#ECE7DD`, `#E3DDD0`, `#DBD4C5`, ink `#19140F`, accent `#E14A1F` (deep `#B83814`). Night stays the first-run default.
- Grid ground: a fine hairline grid at about 3-5% ink, using the old `--grid` token. Keep it subtle enough that text on it stays readable. Applied to the app ground only, never inside cards.
- Radius `10px` on cards and panels, `6px` on small controls. Soft shadows (`0 1px 2px` plus a long low-opacity drop), no hard offset shadows.
- Open for the builder: keep Archivo for body and Chivo Mono for data labels. Whether the old serif (Fraunces) headings and wordmark return is left to the builder, with Archivo as the safe default.
- `DESIGN.md` is rewritten to match; its "Plancha Industrial" rules (zero radius, hard shadows, slate, chamfered buttons, marks-not-hues) are replaced. The marks-not-hues accessibility rule is kept (text label always beside color).

### Navigation: tab strip

- Project tabs become real routes, one per tab, replacing `?tab=` on `/app/projects/[id]`: Partidas, Planos, Solicitudes, Analitica, Informes. The Solicitudes tab is the existing Cambios tab: the dictionary already labels it `requests.tab` = "Solicitudes", and requests carry a kind (change request or alert) and a severity. Victor's "change requests and alerts stay distinct" is already how the data works. The disabled "Settings / soon" tab is dropped unless the builder finds it is wired.
- Pattern from Daysi: one list of tabs read by the layout and the tests; active tab is an exact path match; on narrow screens the strip slides sideways with a fading edge instead of wrapping; the active tab scrolls into view after a route change.
- The existing block view (`?block=` with spaces) must survive the move; its query parameters are kept or mapped to routes at the builder's choice, but old links and notifications deep links must still resolve.

### Side sheet

- One component, patterned on Daysi's `Sheet`: right-hand panel (about 28rem on desktop, full-screen under 640px) over a dimmed backdrop, rendered in a portal; closes on Escape, backdrop click, a Cerrar button, and the phone back gesture (one pushed history entry per open sheet). Focus moves in on open and returns to the opener on close.
- Used for: Partida preview (opens on card click), new Solicitud form, new partida form, new bloque form. The registro composer stays in the cuaderno.
- The shipped Partidas preview panel (`partida-panel.tsx`, `partida-workspace.tsx`) supplies the preview content and its offline behavior; the builder decides whether to adapt it or wrap it.

### Screens (Victor's requests)

- **Projects list (home):** each project is a large image with the name large and the text beside it. A project with no cover image gets a designed placeholder, not a blank box.
- **Project detail header:** full-width cover image, name large on the right, other info (owner, code, status) below. Cover stays optional.
- **Dashboard / Analitica:** block labels and the small logo are aligned one way everywhere (all below, or all beside; builder picks and applies it consistently). Progress bars get a gentle pulse. The existing `bar-grow` entrance stays. The pulse is a slow looping animation on transform or opacity only (never width), and it is switched off under `prefers-reduced-motion`.
- **Partidas:** search bar on top, then a grid of wide cards (chosen over a list with a half-screen preview). Each card shows block name as a vertical label, partida name, record count, last-updated time, progress band, and status text. Search filters as the user types. Clicking a card opens the side sheet preview.
- **Planos:** real thumbnails with each file's original name, plus search, at the project level. Planos is removed from the block level (my call; it settles the conflict with the 2026-08-03 bug list).
- **Solicitudes:** a list of previous requests sits under the new-request form. The form itself moves into the side sheet on tap of a "Nueva solicitud" button; the list stays on the page.
- **Notificaciones:** seen and unseen as separate sections, each keeping search and filters.
- **Back button:** already shipped (#21); keep it and restyle.

## Left to the builder

- File/route structure for the new tab routes and the shared layout.
- Exact grid spacing, tokens, and the pulse timing.
- Whether Fraunces returns.
- Test strategy; the Daysi tab list and sheet each have tests worth copying in spirit.
- The order of work. Suggested: tokens and `DESIGN.md`, then tab strip, then side sheet, then screens.

## My calls for review

1. Night default with the old warm paper as the day theme.
2. Planos kept at project level, removed from block level.
3. No Confirmar bar on records.
4. Cuaderno and registro composer untouched.
5. Settings tab dropped if unwired.

## Risks

- The look change touches nearly every component and 1,300+ lines of `globals.css`; screenshot review of each screen is the only reliable check.
- `projects/[id]/page.tsx` is about 700 lines and branches on `tab` and `block`; splitting it into routes is the largest structural change.
- The spec page was not read; screenshots may show details not captured here.
