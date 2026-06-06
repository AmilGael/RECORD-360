# Breadcrumbs and Feed Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a breadcrumb trail ("you are here") to the project and partida pages, and paginate the registro feed on the partida page to 20 items per page with older/newer navigation.

**Architecture:** Three independent changes: (1) a purely presentational `Breadcrumbs` server component that any page can use; (2) a pure `pageWindow` helper in `src/lib/feed/paginate.ts` that computes skip/take/bounds given total+page+size; (3) wiring both into the two affected pages plus updating `dictionaries.ts` with the new i18n keys. The correction/reply target lookups are moved from `partida.registros.find(...)` to dedicated scoped Prisma queries so they are page-independent.

**Tech Stack:** Next.js 15 App Router (RSC), Prisma, Vitest, TypeScript, `@/components/icons.tsx` (monochrome SVG), `@/i18n/dictionaries.ts` (ES/EN shape-synced).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/components/breadcrumbs.tsx` | **Create** | Presentational server-safe breadcrumb `<nav>` component |
| `src/components/icons.tsx` | **Modify** | Add `ChevronRight` separator icon |
| `src/lib/feed/paginate.ts` | **Create** | Pure `pageWindow()` helper (testable, no side effects) |
| `web/tests/feed-paginate.test.ts` | **Create** | Vitest unit tests for `pageWindow` |
| `src/i18n/dictionaries.ts` | **Modify** | Add `breadcrumb.aria` and `pager` keys to both locales |
| `src/app/app/partidas/[id]/page.tsx` | **Modify** | Replace back-link with breadcrumbs; add pagination; fix correction/reply lookups |
| `src/app/app/projects/[id]/page.tsx` | **Modify** | Replace back-link with breadcrumbs |

---

## Task 1: Add `ChevronRight` icon to `src/components/icons.tsx`

**Files:**
- Modify: `src/components/icons.tsx`

- [ ] **Step 1: Add the ChevronRight export at the bottom of `src/components/icons.tsx`**

The existing file uses `base(size)` for all icons. Append this after the `Bell` export:

```tsx
export function ChevronRight({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors (or same pre-existing errors — none expected in this file).

- [ ] **Step 3: No commit yet** — this is part of the breadcrumbs commit.

---

## Task 2: Write failing tests for `pageWindow`

**Files:**
- Create: `web/tests/feed-paginate.test.ts`

- [ ] **Step 1: Write the test file** (note: `src/lib/feed/paginate.ts` does NOT exist yet, so tests should fail with "module not found")

```ts
import { describe, expect, it } from "vitest";
import { pageWindow } from "@/lib/feed/paginate";

describe("pageWindow", () => {
  // Total 0: degenerate case — one page, nothing to show
  it("total 0 → page 1, totalPages 1, skip 0, no older, no newer", () => {
    const r = pageWindow(0, 1, 20);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(false);
  });

  // 45 items in pages of 20 → 3 pages total
  it("total 45, page 1 → totalPages 3, skip 0, hasOlder true, hasNewer false", () => {
    const r = pageWindow(45, 1, 20);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(0);
    expect(r.hasOlder).toBe(true);
    expect(r.hasNewer).toBe(false);
  });

  it("total 45, page 2 → skip 20, hasOlder true, hasNewer true", () => {
    const r = pageWindow(45, 2, 20);
    expect(r.page).toBe(2);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(20);
    expect(r.hasOlder).toBe(true);
    expect(r.hasNewer).toBe(true);
  });

  it("total 45, page 3 → skip 40, hasOlder false, hasNewer true", () => {
    const r = pageWindow(45, 3, 20);
    expect(r.page).toBe(3);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(40);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(true);
  });

  // Clamping: page 0 → treated as page 1
  it("page 0 clamps to 1", () => {
    const r = pageWindow(45, 0, 20);
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.hasNewer).toBe(false);
  });

  // Clamping: page 99 (>totalPages) → clamps to totalPages
  it("page 99 clamps to totalPages", () => {
    const r = pageWindow(45, 99, 20);
    expect(r.page).toBe(3);
    expect(r.skip).toBe(40);
    expect(r.hasOlder).toBe(false);
  });

  // Exact boundary: 20 items exactly = 1 full page, no older
  it("total 20, page 1 → totalPages 1, no older", () => {
    const r = pageWindow(20, 1, 20);
    expect(r.totalPages).toBe(1);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected output: something like `Cannot find module '@/lib/feed/paginate'` — confirms tests are wired and currently failing.

---

## Task 3: Implement `pageWindow` and make tests green

**Files:**
- Create: `src/lib/feed/paginate.ts`

- [ ] **Step 1: Create the directory and file**

Create `src/lib/feed/paginate.ts` with the following content:

```ts
/**
 * Computes pagination window for a newest-first feed.
 * Page 1 = newest records; higher page numbers = older records.
 *
 * @param total    Total number of records (from COUNT query)
 * @param page     Requested page number (1-based; clamped to [1, totalPages])
 * @param pageSize Number of records per page
 */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number,
): {
  page: number;
  totalPages: number;
  skip: number;
  hasOlder: boolean;
  hasNewer: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const skip = (clamped - 1) * pageSize;
  return {
    page: clamped,
    totalPages,
    skip,
    hasOlder: clamped < totalPages,
    hasNewer: clamped > 1,
  };
}
```

- [ ] **Step 2: Run tests — all must be green**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all `pageWindow` tests PASS plus all previously-passing tests still PASS (no regressions).

- [ ] **Step 3: Commit the helper and its tests**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/lib/feed/paginate.ts tests/feed-paginate.test.ts && git commit -m "$(cat <<'EOF'
feat(feed): add pageWindow pagination helper with full test coverage

Newest-first semantics: page 1 = most recent; higher pages = older.
Clamps page to [1, totalPages]; returns skip, hasOlder, hasNewer.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add i18n keys to both locales in `dictionaries.ts`

**Files:**
- Modify: `src/i18n/dictionaries.ts`

The `Dict` type derives from `es`, so both locales must stay shape-synced.

- [ ] **Step 1: Add keys to the Spanish locale**

Inside the `es` object, after the `notifications` block (before the closing `}`), add:

```ts
    breadcrumb: {
      aria: "Ruta de navegación",
    },
    pager: {
      older: "Anteriores",
      newer: "Siguientes",
      pageLabel: "Página",
      ofLabel: "de",
    },
```

- [ ] **Step 2: Add identical-shape keys to the English locale**

Inside the `en` object, after the `notifications` block (before the closing `}`), add:

```ts
    breadcrumb: {
      aria: "Breadcrumb",
    },
    pager: {
      older: "Older",
      newer: "Newer",
      pageLabel: "Page",
      ofLabel: "of",
    },
```

- [ ] **Step 3: Verify TypeScript — `Dict` must compile cleanly**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: No commit yet** — bundle this with the breadcrumbs commit.

---

## Task 5: Create `src/components/breadcrumbs.tsx`

**Files:**
- Create: `src/components/breadcrumbs.tsx`

A server-safe presentational component. No `"use client"`. Uses `Link` from `next/link` and `ChevronRight` from `@/components/icons`.

- [ ] **Step 1: Create the file**

```tsx
import Link from "next/link";
import { ChevronRight } from "@/components/icons";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  /** Accessible label for the <nav>; e.g. t.breadcrumb.aria */
  ariaLabel: string;
};

/**
 * Presentational breadcrumb trail.
 * - Items with `href` render as links.
 * - The last item is always treated as the current page (aria-current="page"), link or not.
 * - Chevron separators are aria-hidden.
 * - Uses .kicker styling to match the muted, monospace header treatment.
 */
export function Breadcrumbs({ items, ariaLabel }: BreadcrumbsProps) {
  return (
    <nav aria-label={ariaLabel} style={{ marginBottom: 4 }}>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0 2px",
        }}
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={i}
              style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
            >
              {i > 0 && (
                <span aria-hidden="true" style={{ color: "var(--steel)", display: "inline-flex", alignItems: "center" }}>
                  <ChevronRight size={10} />
                </span>
              )}
              {isLast ? (
                <span
                  className="kicker"
                  aria-current="page"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="kicker"
                  style={{ textDecoration: "none", color: "var(--steel)" }}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="kicker">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit breadcrumbs component + icon + i18n keys (all breadcrumb-related changes together)**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/components/breadcrumbs.tsx src/components/icons.tsx src/i18n/dictionaries.ts && git commit -m "$(cat <<'EOF'
feat(ui): add Breadcrumbs component, ChevronRight icon, and breadcrumb/pager i18n keys

Presentational server-safe <nav> with kicker styling; separator is
aria-hidden ChevronRight SVG. Shape-synced ES/EN dictionary keys added
for breadcrumb.aria and pager.{older,newer,pageLabel,ofLabel}.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire breadcrumbs into `src/app/app/projects/[id]/page.tsx`

**Files:**
- Modify: `src/app/app/projects/[id]/page.tsx`

The current back-link (line 213) is:
```tsx
<Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
```

We replace it with the `Breadcrumbs` component showing: **Obras → {project.name}** (current).

- [ ] **Step 1: Add the import near the top of the file (after the existing imports)**

Add after the last existing import line:

```tsx
import { Breadcrumbs } from "@/components/breadcrumbs";
```

- [ ] **Step 2: Replace the back-link with Breadcrumbs**

Find the exact line in the JSX return:
```tsx
      <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
```

Replace with:
```tsx
      <Breadcrumbs
        ariaLabel={t.breadcrumb.aria}
        items={[
          { label: t.nav.sites, href: "/app" },
          { label: project.name },
        ]}
      />
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Emoji scan**

```bash
cd /Users/genel/Mirror/RECORD-360/web && rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/ 2>&1 | head -20
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/app/app/projects/[id]/page.tsx && git commit -m "$(cat <<'EOF'
feat(ui): breadcrumb trail on project page (Obras → project name)

Replaces the plain ← back-link with an accessible <nav> breadcrumb using
t.nav.sites as the root crumb and project.name as current-page crumb.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire breadcrumbs + pagination into `src/app/app/partidas/[id]/page.tsx`

This is the most complex task. We do it in sub-steps.

**Files:**
- Modify: `src/app/app/partidas/[id]/page.tsx`

**Key changes:**
1. Add `page?` to `searchParams` type.
2. Remove `partida.registros` from the Prisma `include` (unbounded load).
3. Add a `prisma.registro.count()` for total.
4. Use `pageWindow()` to compute skip/take.
5. Load only the current page's registros in a separate query.
6. Replace `partida.registros.find(...)` correction/reply lookups with dedicated scoped queries.
7. Replace the `← {project.name}` back-link with `<Breadcrumbs>`.
8. Add pager controls below the feed.

### Sub-step 7a: Update imports and searchParams type

- [ ] **Step 1: Add imports for new helpers/components**

After the last existing import add:
```tsx
import { Breadcrumbs } from "@/components/breadcrumbs";
import { pageWindow } from "@/lib/feed/paginate";
```

- [ ] **Step 2: Update the `searchParams` type**

Change:
```tsx
  searchParams: Promise<{ correctionOf?: string; replyTo?: string }>;
```
to:
```tsx
  searchParams: Promise<{ correctionOf?: string; replyTo?: string; page?: string }>;
```

- [ ] **Step 3: Destructure `page` from searchParams**

Change:
```tsx
  const { correctionOf, replyTo } = await searchParams;
```
to:
```tsx
  const { correctionOf, replyTo, page: pageParam } = await searchParams;
```

### Sub-step 7b: Restructure the Prisma query — remove `registros` from `include`

- [ ] **Step 4: Remove `registros` from the partida `include`**

The `partida` query currently includes `registros` with attachments, location, and replyTo. Remove that entire `registros` include block from `prisma.partida.findFirstOrThrow`. The trimmed include should be:

```ts
  const partida = await prisma.partida.findFirstOrThrow({
    where: { id, project: projectAccessWhere(sessionUser), deletedAt: null },
    include: {
      project: {
        include: {
          locations: { orderBy: { label: "asc" } },
          assignments: { select: { userId: true } },
        },
      },
    },
  });
```

### Sub-step 7c: Add count + pageWindow + paginated registro query

- [ ] **Step 5: Add total count, pagination math, and paginated registros query**

After the `partida` query, insert:

```ts
  // Pagination
  const total = await prisma.registro.count({ where: { partidaId: id } });
  const rawPage = parseInt(pageParam ?? "1", 10);
  const PAGE_SIZE = 20;
  const pagination = pageWindow(total, isNaN(rawPage) ? 1 : rawPage, PAGE_SIZE);

  // Fetch current page of registros
  const registros = await prisma.registro.findMany({
    where: { partidaId: id },
    include: { attachments: true, location: true, replyTo: { select: { id: true, text: true, hash: true } } },
    orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE,
    skip: pagination.skip,
  });
```

### Sub-step 7d: Replace `partida.registros.find` with scoped queries

- [ ] **Step 6: Replace the correction/reply target lookups**

The existing code:
```ts
  const correctionTarget = correctionOf ? partida.registros.find((r) => r.id === correctionOf) : null;
  const replyTarget = replyTo ? partida.registros.find((r) => r.id === replyTo) : null;
```

Replace with:
```ts
  // Look up correction/reply targets via dedicated queries (page-independent).
  const correctionTarget = correctionOf
    ? await prisma.registro.findFirst({ where: { id: correctionOf, partidaId: partida.id } })
    : null;
  const replyTarget = replyTo
    ? await prisma.registro.findFirst({ where: { id: replyTo, partidaId: partida.id } })
    : null;
```

### Sub-step 7e: Fix authorIds to use `registros` (the new local variable) and update the map reference

- [ ] **Step 7: Update the `authorIds` line and all `partida.registros` references**

Change:
```ts
  const authorIds = [...new Set(partida.registros.map((r) => r.authorId))];
```
to:
```ts
  const authorIds = [...new Set(registros.map((r) => r.authorId))];
```

### Sub-step 7f: Replace back-link with Breadcrumbs in JSX

- [ ] **Step 8: Replace the Link back-link**

Find:
```tsx
      <Link href={`/app/projects/${partida.projectId}`} className="kicker" style={{ textDecoration: "none" }}>← {partida.project.name}</Link>
```

Replace with:
```tsx
      <Breadcrumbs
        ariaLabel={t.breadcrumb.aria}
        items={[
          { label: t.nav.sites, href: "/app" },
          { label: partida.project.name, href: `/app/projects/${partida.projectId}` },
          { label: partida.name },
        ]}
      />
```

### Sub-step 7g: Replace `partida.registros.map` with `registros.map` and update empty-check

- [ ] **Step 9: Update the feed rendering loop**

Find:
```tsx
      {partida.registros.map((r) => (
        <RecordCard
```
Replace `partida.registros.map` with `registros.map`:
```tsx
      {registros.map((r) => (
        <RecordCard
```

Also update the empty state check (currently `partida.registros.length === 0`):
```tsx
      {registros.length === 0 && total === 0 && <p className="text-steel">{t.partida.empty}</p>}
```

### Sub-step 7h: Add pager controls below the feed

- [ ] **Step 10: Add pager controls**

After the empty-state paragraph (just before the closing `</div>`), add:

```tsx
      {total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          {pagination.hasNewer ? (
            <Link
              href={`/app/partidas/${partida.id}?page=${pagination.page - 1}`}
              className="btn btn-ghost"
              style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}
            >
              {t.pager.newer}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
          <span className="kicker" style={{ color: "var(--steel)" }}>
            {t.pager.pageLabel} {pagination.page} {t.pager.ofLabel} {pagination.totalPages}
          </span>
          {pagination.hasOlder ? (
            <Link
              href={`/app/partidas/${partida.id}?page=${pagination.page + 1}`}
              className="btn btn-ghost"
              style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}
            >
              {t.pager.older}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
        </div>
      )}
```

### Sub-step 7i: TypeScript, lint, emoji, tests

- [ ] **Step 11: Run TypeScript check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit 2>&1
```

Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 12: Run all tests**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test 2>&1 | tail -30
```

Expected: all tests pass including the `feed-paginate` suite.

- [ ] **Step 13: Run lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm run lint 2>&1 | tail -20
```

Expected: clean (0 warnings/errors).

- [ ] **Step 14: Run emoji scan**

```bash
cd /Users/genel/Mirror/RECORD-360/web && rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/ 2>&1 | head -20
```

Expected: no output (no matches).

- [ ] **Step 15: Commit the partida page changes**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/app/app/partidas/[id]/page.tsx && git commit -m "$(cat <<'EOF'
feat(ui): breadcrumbs + feed pagination on partida page

- Replace plain back-link with Obras→project→partida breadcrumb trail
- Paginate registro feed to 20/page via pageWindow(); add Anteriores/
  Siguientes pager with Página X de Y label
- Move correctionTarget/replyTarget to dedicated scoped Prisma queries
  so they work regardless of which page is displayed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**

| Requirement | Task |
|---|---|
| Breadcrumb component (`breadcrumbs.tsx`) | Task 5 |
| `ChevronRight` separator icon | Task 1 |
| Breadcrumb on `partidas/[id]` page — Obras→project→partida | Task 7 sub-step f |
| Breadcrumb on `projects/[id]` page — Obras→project | Task 6 |
| `t.nav.sites` as root crumb label | Tasks 6 & 7 |
| `breadcrumb.aria` i18n key | Task 4 |
| `aria-label` on `<nav>` | Task 5 (ariaLabel prop passed) |
| `aria-current="page"` on final crumb | Task 5 (isLast branch) |
| Separators `aria-hidden` | Task 5 |
| Page size 20, `page` from searchParams | Task 7 sub-steps b, c |
| `take`/`skip` in query | Task 7 sub-step c |
| `prisma.registro.count()` for total | Task 7 sub-step c |
| `totalPages = Math.max(1, Math.ceil(total/20))` | Task 3 (pageWindow) |
| correctionTarget/replyTarget via dedicated queries | Task 7 sub-step d |
| Pager controls with Anteriores/Siguientes | Task 7 sub-step h |
| Hidden/absent at bounds | Task 7 sub-step h (`pagination.hasNewer/hasOlder`) |
| "Página X de Y" label | Task 7 sub-step h |
| `pageWindow` helper in `src/lib/feed/paginate.ts` | Task 3 |
| TDD: failing tests first | Task 2 |
| All 6 test cases in spec | Task 2 (7 cases total, covers all 6) |
| `pager` i18n keys | Task 4 |
| Shape-synced ES/EN dicts | Task 4 |
| No emoji | Emoji scan in Tasks 5, 7 |
| `npm test` green | Task 7 sub-step i |
| `npx tsc --noEmit` 0 errors | Tasks 1, 4, 5, 6, 7 |
| `npm run lint` clean | Task 7 sub-step i |
| No build | (skipped per spec) |
| No push | (not in any step) |
| Multi-tenant scoping maintained | Tasks 7 c, d — queries use `partidaId: partida.id` (partida already tenant-scoped via `projectAccessWhere`) |

**Placeholder scan:** No TBD/TODO/placeholder text. All code blocks are complete.

**Type consistency:**
- `pageWindow` return type defined and used consistently: `pagination.page`, `pagination.totalPages`, `pagination.skip`, `pagination.hasOlder`, `pagination.hasNewer`.
- `BreadcrumbItem` type exported and used in the component prop type.
- `t.breadcrumb.aria`, `t.pager.older`, `t.pager.newer`, `t.pager.pageLabel`, `t.pager.ofLabel` — all keys added to `dictionaries.ts` in Task 4 before they're used in Tasks 5, 6, 7.
- `registros` local variable used consistently in Tasks 7 e, g, h (not `partida.registros`).
