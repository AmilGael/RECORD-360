---
name: Raphel
description: The obra's record as a precisionist industrial plate — flat hard-edged planes under one raking light.
colors:
  slate-ground: "#1E2328"
  slate-plane: "#2A3138"
  slate-plane-raised: "#343C44"
  chalk: "#F2F1EC"
  chalk-soft: "#C9CCC9"
  steel: "#A0AAB1"
  rust: "#C34E2D"
  rust-deep: "#C24A2A"
  mark-active: "#7fae90"
  mark-merged: "#8d9ac4"
  mark-blocked: "#d0674d"
  brass: "#b08a2e"
  hairline: "rgba(242, 241, 236, 0.14)"
  hairline-strong: "rgba(242, 241, 236, 0.30)"
typography:
  display:
    fontFamily: "Saira Stencil One, Archivo, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 1
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2.7rem"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "0.015em"
    fontVariation: "'wdth' 86"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Chivo Mono, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.2em"
rounded:
  none: "0px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.rust}"
    textColor: "#fff"
    rounded: "{rounded.none}"
    padding: "0.72rem 1.2rem"
  button-primary-hover:
    backgroundColor: "{colors.rust-deep}"
  button-ink:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.slate-ground}"
    rounded: "{rounded.none}"
    padding: "0.72rem 1.2rem"
  button-ink-hover:
    backgroundColor: "{colors.rust}"
    textColor: "#fff"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    rounded: "{rounded.none}"
    padding: "0.72rem 1.2rem"
  input:
    backgroundColor: "{colors.slate-ground}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.none}"
    padding: "0.7rem 0.8rem"
---

# Design System: Raphel

## Overview

**Creative North Star: "Plancha Industrial"** (seed d81dddab; approved comp: `.impeccable/mocks/comp-a-planar-ledger.png`)

The obra's record rendered as a precisionist industrial plate: flat, hard-edged planes under one raking light. The world refuses both the white-card/blue-accent SaaS dashboard and the blueprint-blue cliché. Every surface is painted steel — deep-slate ground, slate planes, chalk type, ash secondaries, rust paint. Nothing glows, nothing floats; the record is machinery, and it holds.

The system is theme-dual but night-native. Night shift (deep slate) is the first-run default — the client reviews the record at night — and day shift is the *same site under daylight*: concrete and chalk with slate ink, derived by re-aiming the identical token set (`:root` day, `body[data-theme="dark"]` night). The public landing commits to night unconditionally via a scoped `.lp-night` token override: it is the brand surface, and the black box's native state is night.

State is carried by **marks, not hues**: the active plane takes the light, pending is a chalk outline, concluded is a full chalk plane, danger and progress are painted rust bands, archived is an unlit plane. The ground itself is painted canvas — flat color with a ~4% SVG-turbulence tooth and one immense hard-edged raking-light diagonal, the world's single light source made visible.

**Key Characteristics:**
- Flat hard-edged planes; zero border radius everywhere; one chamfered corner on actions
- Hard offset shadows only (the raking light) — never blurred halos
- Night-native, day-derived; both shifts share one token vocabulary
- Rust `#C34E2D` night / `#C24A2A` day used as painted bands and commitments, never as ambient wash
- Stencil numerals as the display device; condensed Archivo caps as signage; mono as the data voice
- State grammar of marks (outline / plane / band / unlit), not color-coding alone
- No emoji anywhere in the UI — monochrome SVG line icons or text only (owner rule, PRODUCT.md)

## Colors

One slate ramp, one chalk voice, one rust paint — the palette of a painted-steel yard at night, with three quiet advisory marks.

### Primary
- **Rust** (`--accent`, #C34E2D night / #C24A2A day): the painted band. Primary action fill, progress bands inset on plate bottom edges, active-tab underline, active-language underline, the hover underline on row titles, the underline under the unread tag and the landing step numbers, selection background, the sync-pulse lamp. Small type on a slate plane is never rust (at most 3.35:1); it stays chalk or ink and carries a rust underline. Night rust is dark enough that white type on the button clears 4.5:1. Rust is applied like paint on steel — bands, edges, stamps — never as tinted backgrounds for whole regions. The new-obra toggle and the active state badge use chalk type; the rust icon and the green border stay the marks.
- **Rust Deep** (`--accent-deep`, #C24A2A night / #A83D20 day): the pressed/hover state of rust, and rust legible on chalk planes (the sealed plate's hash, cost figures).

### Neutral
- **Slate Ground** (`--paper`, #1E2328 night / #E9E7E0 day): the page ground and input wells.
- **Slate Plane** (`--paper-2`, #2A3138 night / #F2F1EC day): the standard plate — cards, sidebar, panels, drawer.
- **Slate Plane Raised** (`--paper-3`, #343C44 night / #DDDAD1 day): hover/active surface and track fills — the plane that has taken the light.
- **Chalk** (`--ink`, #F2F1EC night / #1E2328 day): primary type, and the fill of concluded/sealed planes (`.lp-plate--sealed`, `.invite-panel-head`, `.seg-toggle-item.is-on` invert to ink-on-paper).
- **Chalk Soft** (`--ink-soft`, #C9CCC9 night / #3C444C day): secondary type, nav links at rest.
- **Steel** (`--steel`, #A0AAB1 night / #545E65 day): the meta voice — kickers, mono metadata, stencil numerals at rest, placeholders, archived state. Shifted just far enough from the slate planes to clear 4.5:1 on `--paper-3`.
- **Hairline / Hairline Strong** (`--line` chalk at 14% / `--line-strong` chalk at 30%; ink-based in day): every border and divider. Structure is drawn with hairlines, not with elevation.

### State Marks (advisory colors — always paired with a mark or text label, never the only carrier)
- **Mark Active** (`--state-active`, #7fae90 night / #2f6d52 day): open/healthy — badges, done bands, green lamps.
- **Mark Merged** (`--state-merged`, #8d9ac4 night / #4d5a8a day): merged change requests.
- **Mark Blocked** (`--state-blocked`, #d0674d night / #a8432f day): rejected/critical — danger badges, red lamps, soft-danger buttons.
- **Brass** (#b08a2e, text-on-tint #8a6c1a): the middle severity — supervisor role, yellow health lamps, "important" severity chips. Hardcoded in the build but consistently reused; treated as a system color.

**The Marks-Not-Hues Rule.** State is a mark before it is a color: pending = chalk outline (dashed border, transparent fill, no shadow), concluded = full chalk plane, danger/progress = rust band, archived = unlit steel. A color chip alone never carries state; severity chips and badges always contain their text label.

**The Paint Ration Rule.** Rust is paint, applied in bands, edges, and stamps on commitments. It never fills a region larger than a button, and never appears as an ambient background wash.

## Typography

**Display Font:** Saira Stencil One (fallback: Archivo)
**Headline/UI Font:** Archivo variable, `wdth` axis loaded (fallback: system-ui)
**Data/Label Font:** Chivo Mono (fallback: monospace)

**Character:** All three faces are Omnibus-Type (Latin American foundry). Archivo condensed caps read as painted-steel signage; Chivo Mono is the ledger's data voice (timestamps, hashes, codes, kickers, badges); Saira Stencil One is the stencil sprayed on the plate. Fraunces (the old serif brand voice) is retired with the old world.

### Hierarchy
- **Display — stencil numerals** (400, `clamp(2.4rem, 5vw, 3.4rem)` for the yard count, 2.1rem plate index, 1.25–1.55rem stat counts, line-height ≤1, `--steel` at rest): counts and section indices only. `.counter-stencil`, `.plate-index`, `.lp-sec-num`, `.sidebar-stat strong`, `.analitica-card strong`.
- **Headline** (800, 2.7rem `.h-xl` / 2rem `.h-lg`, uppercase, `font-stretch` 82–84%, line-height 0.94–0.98): page and section titles.
- **Title** (800, 1.3rem `.h-md`, uppercase, `font-stretch` 86%, line-height 1.04): panel and plate headings; plate titles use 700/1.05rem at stretch 88%.
- **Body** (400–600, 0.82–0.95rem, line-height 1.4–1.5): Archivo at natural width, sentence case.
- **Label/Kicker** (Chivo Mono, 0.6–0.74rem, 0.06–0.2em tracking, uppercase, `--steel`): kickers, form labels, badges, metadata, filenames, dates.

**The Signage Compression Rule.** The bigger the type, the narrower the width: display headlines compress to 82% width, titles to 86–88%, all uppercase with tight line-height (≤1.05). Body text stays at natural width and sentence case.

**The Stencil-Is-Numerals Rule.** Saira Stencil One sets numerals only — counts, indices, section numbers — never words, never body copy.

**The Two-Voices Rule.** Anything the machine recorded (timestamps, hashes, percentages, codes, filenames, metadata) speaks in Chivo Mono at small sizes with tracking; anything addressed to the human speaks in Archivo.

## Layout

Ledger density on a 1280px maximum container with 28px gutters (16px below 480px). The app shell is a two-column grid: a 280px sticky sidebar plane and a `minmax(0,1fr)` main column, 24px gap; at ≤1040px the sidebar becomes a left drawer (`min(320px, 86vw)`, slide transition) behind a fixed mono drawer-toggle. The dashboard splits `1fr 340px` (stacking at ≤860px); the obra workspace splits `240px 1fr` tree/viewport (stacking at ≤760px); analytics splits `minmax(0,1fr) 320px` (≤960px).

Vertical rhythm is hairline-divided lists: full-width rows separated by 1px `--line` borders with 13–16px block padding, not gapped cards. Internal plate padding runs 14–20px; panel bodies 18px. Safe-area insets (`env()`) pad the appbar and shell for notched phones; touch targets get `min-height: 44px` under `pointer: coarse` only, leaving desktop density unchanged. Tabs become a horizontal scroll strip (no visible scrollbar) at ≤640px; the dashboard table restructures into stacked labeled rows via `td::before { content: attr(data-label) }`.

## Elevation & Depth

Depth is a single raking light, not a z-axis. Shadows are **hard offset planes** — zero blur, zero spread — as if every plate were lit from the upper-left and casting onto the wall behind it. Interactive lift is expressed as the plane "taking the light": background steps up one slate (`--paper-2` → `--paper-3`), the shadow deepens from soft to card, and content nudges (translate, never padding).

### Shadow Vocabulary
- **Soft offset** (`--shadow-soft`: `2px 2px 0 rgba(0,0,0,0.30)` night / `2px 2px 0 rgba(30,35,40,0.10)` day): plates at rest in a list (repo cards, capability planes, analytics panels).
- **Card offset** (`--shadow-card`: `6px 7px 0 rgba(0,0,0,0.38)` night / `5px 6px 0 rgba(30,35,40,0.14)` day): standing planes (sidebar, list containers, landing plates) and the hover state of resting plates.
- **Inset accent bar** (`inset 2px 0 0 var(--accent)`): the active row's left edge (tree rows, reply quotes) — paint, not glow.

**The Raking Light Rule.** Shadows are hard offset planes, never soft halos. `box-shadow` values carry no blur radius. Depth changes are shadow-offset changes plus one slate step — nothing floats, and nothing glows.

The one sanctioned translucency is the sticky appbar: 82% paper with `backdrop-filter: blur(10px)` — glass over the record while it scrolls, not elevation.

## Shapes

Planes have machined edges: `border-radius: 0` on every surface, badge, chip, avatar, and bar (`--radius` and `--radius-sm` are both `0px`). The single sanctioned corner treatment is the **chamfer**: `.btn` clips its bottom-left corner with a 10px `clip-path` polygon — a plate with the corner sheared. The chamfer is the world's signature on every commitment the user makes; it appears on buttons and nowhere else.

**The One Chamfer Rule.** Zero radius everywhere; actions alone carry one 10px chamfered corner (bottom-left). Do not chamfer non-interactive planes, and do not round anything.

**The Round Exception Rule.** Circles are reserved for period-correct hardware: indicator lamps (`.pdot`, `.health-dot`, 8–10px, `border-radius: 50%`) and the sync-chip's 6px pulsing lamp. These are the only curved shapes in the world, and they never grow beyond lamp scale.

Pending/outline states use 1px dashed hairline borders; the active nav link carries a 2px rust left edge; structure elsewhere is 1px solid hairlines.

## Components

### Buttons (`.btn`)
- **Character:** cut steel — condensed caps, square edges, one sheared corner.
- **Shape:** square with a 10px bottom-left chamfer (`clip-path`), radius 0.
- **Type:** Archivo 700 at 88% width, uppercase, 0.82rem, 0.06em tracking; padding `0.72rem 1.2rem`.
- **Primary** (`.btn-accent`): rust fill, white text; hover deepens to rust-deep and lifts −1px.
- **Ink** (`.btn-ink`): chalk plate (ink token) with paper text; hover turns rust.
- **Ghost** (`.btn-ghost`): transparent with `--line-strong` border; hover strengthens the border to ink.
- **Soft danger** (`.btn-danger-soft`): blocked-red at ~12% tint with tinted border.
- **States:** `:active` presses down 1px; `:disabled` at 0.55 opacity with `cursor: progress`; `[aria-busy]` pulses opacity; arrows inside slide +3px on hover. Focus is a 2px rust outline, 2px offset (shared across all interactive classes).

### Quiet Actions (`.icon-action`)
Borderless mono-voice icon+label pairs (Archivar, Restaurar, Borrar): Chivo Mono 0.7rem, steel, `inline-flex` + `nowrap` (icon and label may never stack); hover to ink, danger variant hovers to rust-deep.

### Inputs (`.input`, `.search-input`)
- **Style:** paper-ground well, 1px `--line-strong` border, radius 0, 0.95rem.
- **Focus:** rust border plus a 3px rust-tinted ring (`0 0 0 3px` at ~12%); no outline.
- **File pickers:** native `<input type="file">` styled via `::file-selector-button` as a small ghost button; filename text speaks mono/steel like other file metadata. One treatment across all eight pickers.
- **Form labels:** mono kicker voice (0.68rem, 0.09em tracking, uppercase).

### Badges & Chips (`.state-badge`, `.role-badge`, `.severity-chip`, `.chip`)
Mono 0.58–0.66rem uppercase, radius 0, tinted background (~10–14%) with matching tinted 1px border and state-color text. Text label always present; wrapping is word-boundary only (badges move whole to the next line, never break mid-word).

### Plates (`.repo-card` — signature component)
Each obra is a painted-steel plate: slate-plane grid row (stencil index column + content), 1px hairline, soft offset shadow, radius 0. The **stencil index** (`.plate-index`, Saira 2.1rem, steel) is the plate's painted number; the **progress band** (`.plate-band`, 6px rust bar inset absolutely along the bottom edge over a 12%-ink track) is data as material, not a floating widget; done bands turn mark-active. Hover: the plane takes the light (`--paper-3`, card shadow, index brightens to ink).

### Navigation
- **Appbar:** sticky translucent plane (82% paper + 10px blur), 60px, hairline bottom; brand in wide Archivo 800 caps with a rust dot; the "BLACK BOX" tag is a bordered mono chip that never wraps.
- **Sidebar rail:** slate plane with card shadow; links in condensed Archivo caps 0.8rem with a transparent 2px left border that turns rust + `--paper-3` fill when active; section headings in mono kicker voice; stat counts in stencil.
- **Tabs (`.tabs`):** underline grammar — 2px transparent bottom border, rust 3px when active; disabled tabs carry a mono "soon" chip.
- **Segmented toggle (`.seg-toggle`):** panel-scoped view switch (deliberately not `.tabs` — these are two views of one list, not page peers); bordered mono strip whose active segment inverts to ink-on-paper.

### Lamps & Sync (`.sync-chip`, `.pdot`, `.health-dot`)
The offline-queue chip is a bordered mono chip with a 6px round rust lamp pulsing at 1.4s — the sanctioned round exception, period-correct hardware.

### Motion
One easing (`--ease: cubic-bezier(0.2, 0.7, 0.2, 1)`), 0.15–0.18s for state changes. Page content rises in (`.reveal`, 0.45s, 50ms stagger). Progress and health bars draw themselves once via `transform: scaleX` entrance (`bar-grow`) — never width animation. Hover nudges translate content, never padding. The landing's one authored moment: plates write in narrative order and the seal stamps last with a snap ease. `prefers-reduced-motion` kills everything.

## Do's and Don'ts

### Do:
- **Do** keep every surface at radius 0 and reserve the 10px bottom-left chamfer for `.btn` commitments only.
- **Do** cast hard offset shadows only (`2px 2px 0` at rest, `6px 7px 0` standing/hover in night) and express lift as one slate step up plus a deeper offset.
- **Do** carry state as marks — chalk outline (pending), chalk plane (concluded), rust band (danger/progress), unlit steel (archived) — with the text label always present.
- **Do** set all machine data (timestamps, hashes, counts, filenames, badges) in Chivo Mono at small sizes with tracking, and all display/headline type in condensed Archivo caps.
- **Do** use Saira Stencil One for numerals only, in steel at rest, brightening to ink when its plane takes the light.
- **Do** style native controls into the world (file pickers via `::file-selector-button`, radios via `accent-color`) rather than replacing them with JS widgets.
- **Do** honor both shifts: express every color through the theme tokens so day shift derives automatically; never hardcode a night hex into a component.

### Don't:
- **Don't** use blurred or spread shadows, glows, or halos — the raking light casts hard planes. (The appbar's backdrop blur is the one sanctioned translucency.)
- **Don't** round anything except indicator lamps and the sync pulse; no pills, no rounded avatars, no rounded bars.
- **Don't** let rust fill regions larger than a button or read as ambient background; it is paint on edges, bands, and stamps.
- **Don't** use emoji anywhere in the UI — monochrome SVG line icons or text only (owner rule).
- **Don't** carry state by hue alone; a colored dot or tint without a mark and label is not a state.
- **Don't** revert to the retired world: no blueprint grid ground, no serif (Fraunces) voice, no white-card/blue-accent grammar.
- **Don't** animate layout properties (width, padding); entrances use transform/opacity, hover nudges translate content.
