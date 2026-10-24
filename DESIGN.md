---
name: Raphel
description: The obra's record as a warm site ledger: paper planes with soft rounded corners over a fine hairline grid, one orange accent.
colors:
  night-ground: "#171412"
  night-plane: "#1f1b18"
  night-plane-raised: "#292420"
  night-ink: "#f1e7d8"
  night-ink-soft: "#d4c7b7"
  night-steel: "#b5a998"
  night-accent: "#ff6f43"
  night-accent-deep: "#e85a2c"
  night-on-accent: "#171412"
  night-accent-text: "#ff7d55"
  brass-fill: "#b08a2e"
  night-active: "#5bbd8d"
  night-merged: "#a388e4"
  night-blocked: "#e06a54"
  night-brass: "#c9a347"
  night-line: "rgba(241, 231, 216, 0.12)"
  night-line-strong: "rgba(241, 231, 216, 0.22)"
  night-grid: "rgba(241, 231, 216, 0.03)"
  day-paper: "#ECE7DD"
  day-paper-2: "#E3DDD0"
  day-paper-3: "#DBD4C5"
  day-ink: "#19140F"
  day-ink-soft: "#4A433A"
  day-steel: "#5A5348"
  day-accent: "#E14A1F"
  day-accent-deep: "#B83814"
  day-on-accent: "#19140F"
  day-on-accent-deep: "#ffffff"
  day-accent-text: "#922a0c"
  day-active: "#1f573c"
  day-merged: "#5d4492"
  day-blocked: "#8c3322"
  day-brass: "#654e0d"
  day-line: "rgba(25, 20, 15, 0.14)"
  day-line-strong: "rgba(25, 20, 15, 0.26)"
  day-grid: "rgba(25, 20, 15, 0.045)"
typography:
  display:
    fontFamily: "Saira Stencil One, Archivo, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 1
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.012em"
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
    letterSpacing: "0.16em"
rounded:
  md: "10px"
  sm: "6px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.night-accent}"
    textColor: "{colors.night-on-accent}"
    rounded: "{rounded.sm}"
    padding: "0.72rem 1.2rem"
  button-primary-hover:
    backgroundColor: "{colors.night-accent-deep}"
  button-ink:
    backgroundColor: "{colors.night-ink}"
    textColor: "{colors.night-ground}"
    rounded: "{rounded.sm}"
    padding: "0.72rem 1.2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.sm}"
    padding: "0.72rem 1.2rem"
  input:
    backgroundColor: "{colors.night-ground}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 0.8rem"
  card:
    backgroundColor: "{colors.night-plane}"
    rounded: "{rounded.md}"
  sheet:
    backgroundColor: "{colors.night-plane}"
    rounded: "{rounded.md}"
---

# Design System: Raphel

## Scope

This file describes the look of the signed-in app, everything under `/app`. That look lives in one stylesheet, `web/src/app/app/raphel-app.css`, and every rule in it is scoped under the `.raphel-app` class on the `/app` layout wrapper. The public landing page and the login, activation, reset, request-access and offline screens are out of scope: they still render from `web/src/app/globals.css` exactly as before, and nothing here applies to them. A test (`web/tests/raphel-app-theme.test.ts`) fails if a rule in `raphel-app.css` is not scoped.

## Overview

**Creative North Star: "Cuaderno de Obra"** (the original Raphel look, recovered from git before commit 2dff366 and confirmed by Victor, 2026-10-20).

The obra's record as a warm site ledger: paper planes with soft rounded corners, lying on a fine hairline grid, with one orange accent. The app is a sales tool for Dominican construction companies, so it must feel calm, warm and finished, not industrial.

The system is theme-dual and night-native. Night is the first-run default (`r360_theme` cookie applied as `body[data-theme]`); day is the same site under daylight, derived by re-aiming one token set (`.raphel-app` day, `body[data-theme="dark"] .raphel-app` night).

**Key characteristics:**
- Warm dark ground (night) or warm paper (day), never slate, never white.
- Rounded planes: `10px` on cards, panels and sheets, `6px` on small controls.
- Soft shadows only: a tight `0 1px 2px` contact shadow plus a long, low-opacity drop. No hard offset shadows.
- A fine hairline grid on the app ground only, never inside a card.
- One orange accent for commitments and the active mark; never an ambient wash.
- Archivo for everything addressed to a person, Chivo Mono for everything the machine recorded.
- State is never carried by color alone.
- No emoji anywhere in the UI.

## Colors

### Night (first-run default)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#171412` | App ground, input wells |
| `--paper-2` | `#1f1b18` | Standard plane: cards, sidebar, panels, sheet |
| `--paper-3` | `#292420` | Raised plane: hover, active row, track fills |
| `--ink` | `#f1e7d8` | Primary type |
| `--ink-soft` | `#d4c7b7` | Secondary type, nav at rest |
| `--steel` | `#b5a998` | Meta voice: kickers, mono metadata, placeholders |
| `--accent` | `#ff6f43` | Primary action fill, active marks, progress bands |
| `--accent-deep` | `#e85a2c` | Accent hover fill |
| `--accent-text` | `#ff7d55` | Accent used as small text (errors, costs, links, admin badge) |
| `--on-accent` | `#171412` | Type on an accent fill |
| `--on-accent-deep` | `#171412` | Type on an accent-deep fill |
| `--state-active` | `#5bbd8d` | Open / healthy / done |
| `--state-merged` | `#a388e4` | Merged change requests |
| `--state-blocked` | `#e06a54` | Rejected / critical |
| `--brass` | `#c9a347` | Middle severity (supervisor, "important") |
| `--line` | `rgba(241, 231, 216, 0.12)` | Hairlines and dividers |
| `--line-strong` | `rgba(241, 231, 216, 0.22)` | Control borders, emphasized dividers |
| `--grid` | `rgba(241, 231, 216, 0.03)` | Ground grid lines |

### Day (derived)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#ECE7DD` | App ground, input wells |
| `--paper-2` | `#E3DDD0` | Standard plane |
| `--paper-3` | `#DBD4C5` | Raised plane |
| `--ink` | `#19140F` | Primary type |
| `--ink-soft` | `#4A433A` | Secondary type |
| `--steel` | `#5A5348` | Meta voice |
| `--accent` | `#E14A1F` | Primary action fill, active marks, progress bands |
| `--accent-deep` | `#B83814` | Accent hover fill |
| `--accent-text` | `#922a0c` | Accent used as small text |
| `--on-accent` | `#19140F` | Type on an accent fill |
| `--on-accent-deep` | `#ffffff` | Type on an accent-deep fill |
| `--state-active` | `#1f573c` | Open / healthy / done |
| `--state-merged` | `#5d4492` | Merged change requests |
| `--state-blocked` | `#8c3322` | Rejected / critical |
| `--brass` | `#654e0d` | Middle severity |
| `--line` | `rgba(25, 20, 15, 0.14)` | Hairlines |
| `--line-strong` | `rgba(25, 20, 15, 0.26)` | Control borders |
| `--grid` | `rgba(25, 20, 15, 0.045)` | Ground grid lines |

### Contrast notes

- Ink and soft ink clear 4.5:1 on the ground in both themes (night 15.0 and 11.1; day 14.8 and 7.9).
- **Type on the accent is dark in both themes.** White on the night accent is 2.8:1 and white on the day accent `#E14A1F` is 4.0:1, both under 4.5:1. Dark type reaches 6.6:1 (night) and 4.5:1 (day). On hover the day button deepens to `#B83814`, where dark type fails, so the type turns white (5.8:1). This is why `--on-accent` and `--on-accent-deep` exist: never hard-code `#fff` on an accent fill.
- **Accent as text uses `--accent-text`**, never `--accent` or `--accent-deep`: the pinned `--accent-deep` is for fills (day `#B83814` is only 3.9:1 on `--paper-3`; night `#e85a2c` is 4.2:1 on a 10% accent tint). `--accent-text` clears 4.5:1 on all three planes and on an 8 to 12% accent tint over them. Inline styles write `var(--accent-text, var(--accent-deep))` so a component rendered outside `/app` still has a color.
- Badge text on its own tint clears 4.5:1: day state colors and day brass are darker than the pre-2026 values, night brass is lighter (`#c9a347`), and the night blocked tint is 8% (12% put `#e06a54` at 4.4:1). Night blocked text over a tint on `--paper-3` stays under 4.5:1 because the pinned color itself is only 4.65:1 there; keep critical chips off the raised plane.
- `.btn-danger-soft` keeps its resting tint on hover (a deeper tint fails); the border carries the hover.
- The supervisor avatar is filled `#b08a2e` in both themes, so its initials are dark (`#171412`, 5.7:1).
- `.state-badge.is-active` keeps ink text; the green tint and border are the mark.

**The Marks-Not-Hues Rule.** State is never carried by color alone. Every colored state (badge, dot, band, chip, lamp) sits beside its text label. A colored dot without a label is not a state.

**The Paint Ration Rule.** The accent is for commitments (primary buttons), the active mark (tab underline, active row edge) and progress bands. It never fills a region larger than a button, and never appears as a background wash.

## Typography

**Headline / UI font:** Archivo (fallback: system-ui).
**Data / label font:** Chivo Mono (fallback: monospace).
**Numerals:** Saira Stencil One, kept only where existing markup already uses it for counts and indices.

Fraunces (the old serif) is retired; Archivo carries headings and the wordmark.

### Hierarchy
- **Headline** (`.h-xl` 2.6rem / `.h-lg` 2rem, 700, sentence case, natural width, `-0.02em` tracking, line-height about 1): page titles.
- **Title** (`.h-md` 1.35rem, 700, sentence case): panel and card headings.
- **Body** (400 to 600, 0.82 to 0.95rem, line-height 1.4 to 1.5): sentence case.
- **Label / kicker** (Chivo Mono, 0.6 to 0.74rem, uppercase, 0.06 to 0.2em tracking, `--steel`): kickers, form labels, badges, metadata, filenames, dates.

**The Two-Voices Rule.** Anything the machine recorded (timestamps, hashes, percentages, codes, filenames) speaks in Chivo Mono; anything addressed to the person speaks in Archivo.

Buttons, nav links and card titles are sentence case at natural width. Uppercase is reserved for the mono label voice.

## Layout

A 1280px maximum container with 28px gutters (16px below 480px). The app shell is a 280px sticky sidebar plus a `minmax(0, 1fr)` main column, 24px gap; at 1040px and below the sidebar becomes a left drawer. Touch targets get `min-height: 44px` under `pointer: coarse`. Nothing may make the page scroll sideways at 390px.

## Ground

The app ground is a fine hairline grid: 1px lines at `--grid` on a 14px cell over `--paper`, with `background-attachment: fixed` so the grid stays put while the record scrolls. It is subtle enough that type set directly on it stays readable.

Behind the wrapper, `body:has(.raphel-app)` (and its night form) paints the body in the same `--paper` value, so iOS overscroll never shows another color. These two selectors are the only ones in `raphel-app.css` not under `.raphel-app`; they cannot match the landing or auth screens, which never contain the class.

Only the ground gets the grid. Cards, panels, the sidebar, the sheet and every other plane carry an opaque `--paper-2` (or `--paper`) fill, so the grid never shows inside them.

## Elevation and shadows

Depth is soft and quiet. Every shadow is a tight contact shadow plus a long low-opacity drop:

| Token | Night | Day | Use |
|---|---|---|---|
| `--shadow-soft` | `0 1px 2px rgba(0, 0, 0, 0.22), 0 8px 20px -12px rgba(0, 0, 0, 0.40)` | `0 1px 2px rgba(25, 20, 15, 0.05), 0 6px 16px -10px rgba(25, 20, 15, 0.10)` | Cards at rest in a list |
| `--shadow-card` | `0 1px 2px rgba(0, 0, 0, 0.22), 0 16px 34px -20px rgba(0, 0, 0, 0.50)` | `0 1px 2px rgba(25, 20, 15, 0.05), 0 12px 30px -14px rgba(25, 20, 15, 0.14)` | Standing panels, hover lift |
| `--shadow-sheet` | `0 1px 2px rgba(0, 0, 0, 0.22), 0 24px 60px -18px rgba(0, 0, 0, 0.60)` | `0 1px 2px rgba(25, 20, 15, 0.05), 0 24px 60px -18px rgba(25, 20, 15, 0.22)` | The side sheet |

**The No-Offset Rule.** No hard offset shadows (zero-blur `x y 0` planes) inside `/app`. Lift is one plane step up (`--paper-2` to `--paper-3`) plus `--shadow-soft` to `--shadow-card`. Inset accent bars (`inset 2px 0 0 var(--accent)`) are marks, not shadows, and stay.

The sticky appbar is the one translucent surface: 82% ground with a 10px backdrop blur.

## Shapes

- `--radius: 10px` on cards, panels, plates, list containers, the workspace and the sheet.
- `--radius-sm: 6px` on buttons, inputs, badges, chips, tags, nav links and small controls. On thin bars (progress tracks, 4 to 10px tall) the same token renders as fully rounded ends.
- Indicator lamps and avatars are circles.
- No chamfers. The `clip-path` cut corner of the retired look is removed from `.btn`.

## Components

### Buttons (`.btn`)
Archivo 700, 0.9rem, sentence case, `--radius-sm`, padding `0.72rem 1.2rem`.
- **Primary** (`.btn-accent`): accent fill, `--on-accent` type; hover deepens to `--accent-deep` with `--on-accent-deep` type and lifts 1px.
- **Ink** (`.btn-ink`): ink fill, ground type; hover turns accent with `--on-accent` type.
- **Ghost** (`.btn-ghost`): transparent, `--line-strong` border; hover strengthens the border to ink.
- **Soft danger** (`.btn-danger-soft`): `--state-blocked-bg` tint with a tinted border; hover strengthens the border only.
- Focus is a 2px accent outline, 2px offset.

### Inputs (`.input`, `.search-input`)
Ground-colored well, 1px `--line-strong` border, `--radius-sm`. Focus: accent border plus a 3px accent ring at 12%.

### Cards and panels (`.card`, `.repo-list`, `.panel-create`, `.invite-panel`, `.analitica-card`, `.planos-card`)
`--paper-2` fill, 1px `--line` border, `--radius`, `--shadow-soft` at rest or `--shadow-card` standing. No grid inside.

### Badges and chips (`.state-badge`, `.role-badge`, `.severity-chip`, `.chip`, `.aging-mark`)
Chivo Mono 0.58 to 0.66rem uppercase, `--radius-sm`, a 10 to 14% tint of the state color with a matching tinted border and state-colored text. The text label is always present.

### Tab strip (project tabs)
One list of tabs (`web/src/lib/project/tabs.ts`) read by the layout and the tests. Each tab is a real route; the active tab is an exact path match, carries `aria-current="page"` and a 3px accent underline. On narrow screens the strip slides sideways with a fading edge instead of wrapping (`.slide-row`), and the active tab scrolls into view after a route change. All five Spanish labels must fit at 390px without the page scrolling sideways.

### Side sheet (`.sheet-*`)
One component for the Partida preview and the create forms. A right-hand panel, about 28rem wide on desktop and full screen under 640px, over a dimmed backdrop, rendered into `#sheet-root` (the last child of the `/app` wrapper). `--paper-2` fill, `--radius` on its open edge, `--shadow-sheet`. Closes on Escape, backdrop click, a Cerrar button and the phone back gesture (one pushed history entry per open sheet). Focus moves in on open and returns to the opener on close. No confirm bar: records are append-only.

### Navigation
- **Appbar:** sticky translucent plane, 60px, hairline bottom; wordmark in Archivo 800 sentence case with an accent dot.
- **Sidebar:** `--paper-2` plane, `--radius`, `--shadow-card`; links in Archivo 600 sentence case with `--radius-sm`; the active link takes `--paper-3` and a 2px accent left edge.

## Motion

- One easing, `--ease: cubic-bezier(0.2, 0.7, 0.2, 1)`, 0.15 to 0.2s for state changes.
- Animate `transform` and `opacity` only. Never animate width, height or padding.
- Progress fills draw in once with `transform: scaleX` (`bar-grow`). Progress bands may carry a slow, gentle pulse (`.pulse-band`), on opacity or transform only.
- The sheet slides in with `transform: translateX` (from the bottom edge on phones) and the backdrop fades.
- Everything animated stops under `prefers-reduced-motion: reduce`.

## Do's and Don'ts

### Do
- **Do** express every color through the tokens so day derives from night automatically.
- **Do** use `--on-accent` / `--on-accent-deep` for any type on an accent fill, and `--accent-text` for accent-colored type.
- **Do** give every plane an opaque fill so the ground grid stays on the ground.
- **Do** put a text label beside every colored state.
- **Do** scope every new `/app` rule under `.raphel-app` in `raphel-app.css` (a descendant or compound step, never a sibling combinator).

### Don't
- **Don't** use hard offset shadows, chamfered corners or zero-radius planes inside `/app`.
- **Don't** put white type on the accent.
- **Don't** let the accent fill a region larger than a button.
- **Don't** use emoji anywhere in the UI: monochrome SVG line icons (`web/src/components/icons.tsx`) or text only.
- **Don't** carry state by color alone.
- **Don't** animate layout properties.
- **Don't** edit `globals.css` to change the `/app` look: the landing and auth screens depend on it.
