# Raphl — Rename & Premium Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from RECORD 360 to **Raphl** across every user-visible surface and lift the existing warm-paper theme to an editorial-premium look (Fraunces serif wordmark + headings, softer corners, soft shadows), keeping the orange accent.

**Architecture:** Evolve the existing token-based design system in place — no new architecture, no palette migration. Changes are concentrated in `web/src/app/globals.css` (tokens + a handful of classes), `web/src/app/layout.tsx` (register the Fraunces font), four `.tsx` files that hardcode the wordmark, the i18n dictionaries, the standalone `landing/index.html`, and the `README.md` headline.

**Tech Stack:** Next.js 15 (App Router, React 19), Tailwind v4 (`@tailwindcss/postcss` + `@theme` in CSS), `next/font/google`, Vitest (node env, `tests/**/*.test.ts`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-01-raphl-rename-theming-design.md`

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `web/tests/branding.test.ts` | Asserts the app name is "Raphl" and the old product name is gone from i18n | Create |
| `web/src/i18n/dictionaries.ts` | ES/EN strings; `common.app` rename | Modify |
| `web/src/app/layout.tsx` | Register Fraunces font, expose `--font-fraunces`, page `<title>` | Modify |
| `web/src/app/globals.css` | `--font-serif` token, radius, shadows, serif headings + wordmark, card shadow | Modify |
| `web/src/app/app/layout.tsx` | App-shell wordmark markup | Modify |
| `web/src/app/page.tsx` | Landing header + footer wordmark markup (lines 14, 101) | Modify |
| `web/src/app/login/page.tsx` | Login wordmark markup (line 31) | Modify |
| `landing/index.html` | Standalone marketing page: title, font link, wordmark, hero, copy | Modify (then `git add`) |
| `README.md` | Headline + project name | Modify |

Decisions locked by the spec: keep orange accent (`--accent: #E14A1F`), keep the warm-paper palette, keep the "BLACK BOX" / "caja negra" copy, keep the seeded demo credential `admin@record360.do` (and the `record360.do` contact domain). Light theme only.

---

## Task 1: Rename the app name in i18n (TDD)

**Files:**
- Test: `web/tests/branding.test.ts` (create)
- Modify: `web/src/i18n/dictionaries.ts:7` and `:94`

- [ ] **Step 1: Write the failing test**

Create `web/tests/branding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

describe("Raphl branding", () => {
  it("uses Raphl as the app name in both locales", () => {
    expect(dictionaries.es.common.app).toBe("Raphl");
    expect(dictionaries.en.common.app).toBe("Raphl");
  });

  it("has no leftover 'RECORD 360' product name in i18n copy", () => {
    // The seeded demo credential (admin@record360.do) is intentionally
    // retained; it does not contain the display string "RECORD 360".
    const json = JSON.stringify(dictionaries);
    expect(json).not.toContain("RECORD 360");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/branding.test.ts`
Expected: FAIL — `expected 'RECORD 360' to be 'Raphl'` (and the second test fails on the leftover string).

- [ ] **Step 3: Make the change**

In `web/src/i18n/dictionaries.ts`, line 7, change:

```ts
    common: { app: "RECORD 360", blackBox: "BLACK BOX" },
```
to:
```ts
    common: { app: "Raphl", blackBox: "BLACK BOX" },
```

And line 94 (the `en` block), change the identical line the same way:

```ts
    common: { app: "Raphl", blackBox: "BLACK BOX" },
```

Leave everything else (taglines, "BLACK BOX", the `Demo: admin@record360.do` strings on lines 50 and 137) untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/branding.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add web/tests/branding.test.ts web/src/i18n/dictionaries.ts
git commit -m "feat(i18n): rename product RECORD 360 -> Raphl in dictionaries"
```

---

## Task 2: Register the Fraunces font and rename the page title

**Files:**
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Add the Fraunces import and instance**

In `web/src/app/layout.tsx`, change line 2:

```ts
import { Archivo, Space_Mono } from "next/font/google";
```
to:
```ts
import { Archivo, Space_Mono, Fraunces } from "next/font/google";
```

After line 7 (the `mono` const), add:

```ts
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
```

(`Fraunces` is a variable font on Google Fonts, so no `weight` array is needed — the full range is available.)

- [ ] **Step 2: Rename the page title**

Change line 10:

```ts
  title: "RECORD 360 — La caja negra de tu obra",
```
to:
```ts
  title: "Raphl — La caja negra de tu obra",
```

- [ ] **Step 3: Add the font variable to `<body>`**

Change line 18:

```tsx
      <body className={`${archivo.variable} ${mono.variable}`}>{children}</body>
```
to:
```tsx
      <body className={`${archivo.variable} ${mono.variable} ${fraunces.variable}`}>{children}</body>
```

- [ ] **Step 4: Verify the app still builds**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (no type errors). The font won't be visibly used until Task 3 wires `--font-serif`.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "feat(theme): register Fraunces font, rename root page title to Raphl"
```

---

## Task 3: Theme tokens — serif headings, softer radius, soft shadows

**Files:**
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Expose the serif token and add radius/shadow tokens**

In `web/src/app/globals.css`, change the `:root` block (lines 3–17) — replace the `--radius` line and add new tokens so the block reads:

```css
:root {
  --paper: #ECE7DD;
  --paper-2: #E3DDD0;
  --paper-3: #DBD4C5;
  --ink: #19140F;
  --ink-soft: #4A433A;
  --steel: #6B6358;
  --accent: #E14A1F;
  --accent-deep: #B83814;
  --line: rgba(25, 20, 15, 0.14);
  --line-strong: rgba(25, 20, 15, 0.26);
  --grid: rgba(25, 20, 15, 0.045);
  --radius: 10px;
  --radius-sm: 6px;
  --shadow-soft: 0 1px 2px rgba(25, 20, 15, 0.04);
  --shadow-card: 0 1px 2px rgba(25, 20, 15, 0.04), 0 12px 30px -14px rgba(25, 20, 15, 0.12);
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
}
```

Then in the `@theme inline` block (lines 19–24), add the serif mapping so it reads:

```css
@theme inline {
  --color-background: var(--paper);
  --color-foreground: var(--ink);
  --font-sans: var(--font-archivo);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-fraunces);
}
```

- [ ] **Step 2: Make the headings serif**

Replace the three heading rules (currently):

```css
.h-xl { font-weight: 900; letter-spacing: -0.035em; line-height: 0.92; }
.h-lg { font-weight: 900; letter-spacing: -0.03em; line-height: 0.98; }
.h-md { font-weight: 800; letter-spacing: -0.022em; line-height: 1.04; }
```
with:
```css
.h-xl { font-family: var(--font-serif), Georgia, serif; font-weight: 600; letter-spacing: -0.02em; line-height: 0.96; }
.h-lg { font-family: var(--font-serif), Georgia, serif; font-weight: 600; letter-spacing: -0.018em; line-height: 1.0; }
.h-md { font-family: var(--font-serif), Georgia, serif; font-weight: 600; letter-spacing: -0.012em; line-height: 1.06; }
```

- [ ] **Step 3: Make the wordmark serif and give the dot the accent color**

Find the `.brand b` rule:

```css
.brand b { font-weight: 900; letter-spacing: -0.02em; font-size: 1.05rem; }
```
replace with:
```css
.brand b { font-family: var(--font-serif), Georgia, serif; font-weight: 600; letter-spacing: -0.01em; font-size: 1.25rem; }
.brand .dot { color: var(--accent); }
```

- [ ] **Step 4: Soften input corners and add the card shadow**

Find the `.input` rule and change its `border-radius: var(--radius);` to `border-radius: var(--radius-sm);` (inputs would look puffy at 10px). The full rule becomes:

```css
.input {
  width: 100%; padding: 0.7rem 0.8rem; font-size: 0.95rem; font-family: inherit;
  background: var(--paper); color: var(--ink);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  transition: border-color 0.18s var(--ease), box-shadow 0.18s var(--ease);
}
```

Find the generic card rule:

```css
.card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); }
```
replace with:
```css
.card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper-2); box-shadow: var(--shadow-card); }
```

Leave the `.brand .tag` chip at its existing `border-radius: 2px` (deliberate industrial chip), and leave `.btn` using `var(--radius)` (buttons at 10px are fine).

- [ ] **Step 5: Verify the build compiles the CSS**

Run: `cd web && npm run build`
Expected: PASS — Next build completes with no CSS/type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/globals.css
git commit -m "feat(theme): serif headings/wordmark, 10px radius, soft card shadows"
```

---

## Task 4: Update the in-app wordmark markup (3 files)

The wordmark text is hardcoded as `RECORD&nbsp;360`. Replace each with `Raphl` plus an accent dot. The `.brand .dot` style added in Task 3 colors the period.

**Files:**
- Modify: `web/src/app/app/layout.tsx:16`
- Modify: `web/src/app/page.tsx:14` and `:101`
- Modify: `web/src/app/login/page.tsx:31`

- [ ] **Step 1: App shell wordmark**

In `web/src/app/app/layout.tsx`, line 16, change:

```tsx
          <Link href="/app" className="brand"><b>RECORD&nbsp;360</b><span className="tag">{t.common.blackBox}</span></Link>
```
to:
```tsx
          <Link href="/app" className="brand"><b>Raphl<span className="dot">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
```

- [ ] **Step 2: Landing header + footer wordmark**

In `web/src/app/page.tsx`, line 14, change:

```tsx
          <Link href="/" className="brand"><b>RECORD&nbsp;360</b><span className="tag">{t.common.blackBox}</span></Link>
```
to:
```tsx
          <Link href="/" className="brand"><b>Raphl<span className="dot">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
```

And line 101, change:

```tsx
          <span className="brand"><b>RECORD&nbsp;360</b></span>
```
to:
```tsx
          <span className="brand"><b>Raphl<span className="dot">.</span></b></span>
```

- [ ] **Step 3: Login wordmark**

In `web/src/app/login/page.tsx`, line 31, change:

```tsx
          <Link href="/" className="brand"><b>RECORD&nbsp;360</b><span className="tag">{t.common.blackBox}</span></Link>
```
to:
```tsx
          <Link href="/" className="brand"><b>Raphl<span className="dot">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
```

- [ ] **Step 4: Verify no stray RECORD wordmark remains in `src`**

Run: `cd web && grep -rn "RECORD" src --include=*.tsx`
Expected: no output (exit 1 / empty).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/app/layout.tsx web/src/app/page.tsx web/src/app/login/page.tsx
git commit -m "feat(ui): Raphl wordmark with accent dot in app shell, landing, login"
```

---

## Task 5: Rename and re-mark the standalone landing page

`landing/index.html` is a standalone marketing page (currently untracked). Apply the rename, give the wordmark the serif + accent-dot treatment, make the hero `h1` serif, and load Fraunces. Leave the other poster headings (`.sec-title`, `.cta h2`, `.stat .num`) in Archivo — they are a deliberate display-poster art direction that Fraunces would not serve at those sizes.

**Files:**
- Modify: `landing/index.html` (lines 6, 10, 23, 71, 112, 264, 359, 360, 369)

- [ ] **Step 1: Title and font loading**

Line 6, change:

```html
<title>RECORD 360 — La caja negra de tu obra</title>
```
to:
```html
<title>Raphl — La caja negra de tu obra</title>
```

Line 10, add Fraunces to the Google Fonts request:

```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
```
becomes:
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Add a serif CSS variable**

Line 23–24 currently:

```css
    --display: "Archivo", sans-serif;
    --mono: "Space Mono", monospace;
```
change to:
```css
    --display: "Archivo", sans-serif;
    --serif: "Fraunces", Georgia, serif;
    --mono: "Space Mono", monospace;
```

- [ ] **Step 3: Make the wordmark serif + add the dot style**

Line 71 currently:

```css
    font-family: var(--display); font-weight: 900; font-size: 1.15rem;
```
change to:
```css
    font-family: var(--serif); font-weight: 600; font-size: 1.35rem;
```

Add a dot rule immediately after the `.brand-mark` rule's closing brace:

```css
  .brand-mark .dot { color: var(--accent); }
```

- [ ] **Step 4: Make the hero heading serif**

Line 112 currently:

```css
    font-family: var(--display); font-weight: 900;
```
(this is the `h1` rule) change to:
```css
    font-family: var(--serif); font-weight: 600;
```

- [ ] **Step 5: Update the wordmark markup (two spots) and body copy**

Line 264, change:

```html
      <span class="brand-mark">RECORD&nbsp;360</span>
```
to:
```html
      <span class="brand-mark">Raphl<span class="dot">.</span></span>
```

Line 369, change the identical footer markup the same way:

```html
        <span class="brand-mark">Raphl<span class="dot">.</span></span>
```

Line 359, change:

```html
      <p>Que quede registrada. Agenda una demo y mira RECORD 360 funcionando con un proyecto real.</p>
```
to:
```html
      <p>Que quede registrada. Agenda una demo y mira Raphl funcionando con un proyecto real.</p>
```

Line 360, change the visible subject text (keep the `hola@record360.do` address — the contact domain is intentionally retained):

```html
      <a href="mailto:hola@record360.do?subject=Quiero%20una%20demo%20de%20RECORD%20360" class="btn btn-primary" style="font-size:1rem;padding:15px 28px;">Solicitar demo <span class="btn-arrow">→</span></a>
```
to:
```html
      <a href="mailto:hola@record360.do?subject=Quiero%20una%20demo%20de%20Raphl" class="btn btn-primary" style="font-size:1rem;padding:15px 28px;">Solicitar demo <span class="btn-arrow">→</span></a>
```

- [ ] **Step 6: Verify only the intended references remain**

Run: `cd /Users/genel/Mirror/RECORD-360 && grep -niE "RECORD 360|RECORD&nbsp;360" landing/index.html`
Expected: no output. (Lowercase `record360.do` in the two `mailto:` addresses is intentionally retained and will not match.)

- [ ] **Step 7: Commit**

```bash
git add landing/index.html
git commit -m "feat(landing): rename to Raphl, serif wordmark + hero on standalone page"
```

---

## Task 6: Rename the README headline

**Files:**
- Modify: `README.md:1` and `:4`

- [ ] **Step 1: Update the headline and project name**

Line 1, change `# RECORD-360` to:

```md
# Raphl (formerly RECORD-360)
```

Line 4, change `Project Name: RECORD 360` to:

```md
Project Name: Raphl
```

Leave the rest of the PRD body unchanged.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): rename headline to Raphl"
```

---

## Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd web && npm run test`
Expected: all tests pass, including `tests/branding.test.ts` (and the pre-existing `canonical`, `hash`, `append`, `storage-mime` suites).

- [ ] **Step 2: Lint and build**

Run: `cd web && npm run lint && npm run build`
Expected: lint clean; production build succeeds.

- [ ] **Step 3: Assert the product name is gone from user-visible surfaces**

Run:
```bash
cd /Users/genel/Mirror/RECORD-360 && \
grep -rniE "RECORD 360|RECORD&nbsp;360|RECORD-360" \
  web/src landing/index.html README.md
```
Expected: the only match is `README.md:1` (`# Raphl (formerly RECORD-360)`). No matches in `web/src` or `landing/index.html`. (The seeded `record360.do` email/domain is intentionally retained and does not match these patterns.)

- [ ] **Step 4: Manual visual check (dev server)**

Run: `cd web && npm run dev`, then in a browser visit `/` (landing), `/login`, `/app` (dashboard), and a partida feed. Toggle ES ⇄ EN via the language switcher on each. Confirm:
- Wordmark reads `Raphl.` in **Fraunces**, the period is **orange**.
- Section/hero headings render in Fraunces.
- Cards show a soft shadow; corners are ~10px; inputs are ~6px and not puffy.
- The orange accent is intact (buttons, links, focus rings, "Crítico"/REC chips).
- No layout breakage from the radius/shadow changes; no "RECORD 360" text anywhere.

- [ ] **Step 5: Final confirmation**

No commit needed (verification only). If Step 4 surfaces a visual regression, fix it in the relevant file from Tasks 3–5 and re-run Steps 1–3 before finishing.

---

## Self-Review

**Spec coverage:**
- Rename RECORD 360 → Raphl (user-visible) → Tasks 1 (i18n), 2 (title), 4 (app wordmarks), 5 (landing), 6 (README). ✓
- Fraunces wordmark + headings → Tasks 2 (font register), 3 (CSS), 5 (landing). ✓
- Keep orange accent → unchanged tokens (Task 3 keeps `--accent`). ✓
- Radius 4→10px + `--radius-sm` → Task 3. ✓
- Soft shadow tokens + card shadow → Task 3. ✓
- Wordmark accent dot → Tasks 3 (`.dot` style) + 4/5 (markup). ✓
- Light-first, tokens semantically named → Task 3 keeps token structure; no dark theme added. ✓
- Out-of-scope items (demo credential, internal identifiers, "BLACK BOX"/tagline, logo mark, dark theme) → none touched. ✓
- Verification (build, lint, grep, manual ES/EN visual) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact before/after content. ✓

**Type/name consistency:** Font CSS variable is `--font-fraunces` everywhere (layout.tsx instance → `@theme` `--font-serif: var(--font-fraunces)` → headings/wordmark use `var(--font-serif)`). Wordmark dot class is `.dot` in both CSS (Task 3) and markup (Tasks 4–5). The landing page uses its own `--serif` variable consistently (Task 5). ✓
