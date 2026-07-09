# Raphel R0 — Remaining Tasks (4–13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining R0 quick-wins: Planos merge (R0.4), sidebar gating (R0.6), Cambios schema + validators + create-enforcement + resolve-enforcement + UI (R0.10), purge notifications (R0.9), borrar-obra surface (R0.8), manager-content regression lock (R0.7), and icon sweep (R0.11).

**Architecture:** All changes ride existing patterns — dictionary-driven i18n in `src/i18n/dictionaries.ts` (ES default + EN parity required on every string change), server actions with `requireFreshSession`/`requireSession` + Role guards, vitest integration tests in `tests/` against a real Postgres via Prisma with `vi.mock("@/auth")` + `vi.mock("next/cache")`. One additive migration (`ChangeRequest` gets `reminderDueAt` + `resolutionNote`). No destructive schema changes.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (PostgreSQL), NextAuth v5, Vitest 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md`

**Working directory:** `/Users/genel/Mirror/RECORD-360/web` (run ALL commands from here unless noted).
**Branch:** `feat/web-security-hardening` (continue on it; do not switch branches).

**Hard rules (must be enforced in every task):**
- NO emoji anywhere in UI. Monochrome SVG icons from `src/components/icons.tsx` only.
- Every new user-facing string goes in BOTH `es` and `en` blocks of `dictionaries.ts`.
- `raphl:` event names (e.g., `raphl:queue-changed`) are internal identifiers — do NOT rename them.
- Run `npx vitest run <test-file>` from `/Users/genel/Mirror/RECORD-360/web`.
- Run `npm run build` from `/Users/genel/Mirror/RECORD-360/web`.

**Sub-agent boundaries (for parallel dispatch):**
- **Agent A:** Task 4 — Merge Planos + Task 5 — Sidebar gating (pure UI; no schema; no test DB needed)
- **Agent B:** Task 6 + 7 + 8 — Cambios schema + validators + action enforcement (schema migration + server-action TDD)
- **Agent C:** Task 9 — Cambios UI wiring (UI-only; depends on Agent B's schema fields existing in DB)
- **Agent D:** Task 10 — Purge notifications + Task 11 — Surface borrar-obra (two related action-level changes; share DB setup)
- **Agent E:** Task 12 — Manager-content regression tests + Task 13 — Icon sweep (no new schema; can run independently)

> NOTE: Agent C depends on Agent B having run the migration. Agents A, B, D, E are independent of each other and can run in parallel. Agent C must wait for Agent B.

---

## Task 4: Merge "Planos Actualizados" into "Planos" (R0.4)

**Files to modify:**
- `src/components/bloque-spaces-panel.tsx` — drop `"actualizados"` SpaceKey and its SPACES entry
- `src/app/app/projects/[id]/page.tsx` — remove from allowlist/spaceKind, widen spaceDocs query, widen docs query

The `PLANO_ACTUALIZADO` enum stays in the DB schema and all tests — only the navigation space disappears.

- [ ] **Step 1: Remove the space from `bloque-spaces-panel.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/bloque-spaces-panel.tsx`.

Line 10 — change:
```ts
type SpaceKey = "cuaderno" | "planos" | "actualizados" | "levantamientos" | "ideas" | "media" | "recordatorios" | "indicadores";
```
to:
```ts
type SpaceKey = "cuaderno" | "planos" | "levantamientos" | "ideas" | "media" | "recordatorios" | "indicadores";
```

Lines 14–23 — remove the `actualizados` entry from the `SPACES` array. The array after the edit must be:
```ts
const SPACES: { key: SpaceKey; label: string; kind?: DocumentKind }[] = [
  { key: "cuaderno", label: "Cuaderno" },
  { key: "planos", label: "Planos", kind: "PLANO" },
  { key: "levantamientos", label: "Levantamientos", kind: "LEVANTAMIENTO" },
  { key: "ideas", label: "Ideas", kind: "IDEA" },
  { key: "media", label: "Media" },
  { key: "recordatorios", label: "Recordatorios" },
  { key: "indicadores", label: "Indicadores" },
];
```

- [ ] **Step 2: Update `projects/[id]/page.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/app/app/projects/[id]/page.tsx`.

2a. Line ~78 — remove `"actualizados"` from the `selectedSpace` allowlist:
```ts
  const selectedSpace = (["cuaderno", "planos", "levantamientos", "ideas", "media", "recordatorios", "indicadores"].includes(String(space))
    ? String(space)
    : "cuaderno") as SpaceKey;
```

2b. Lines ~81–86 — remove `actualizados: "PLANO_ACTUALIZADO",` from the `spaceKind` map:
```ts
  const spaceKind: Partial<Record<SpaceKey, DocumentKind>> = {
    planos: "PLANO",
    levantamientos: "LEVANTAMIENTO",
    ideas: "IDEA",
  };
```

2c. Lines ~111–116 — widen the `spaceDocs` query so the merged Planos space returns both kinds:
```ts
  const spaceDocs = activeTab === "code" && selectedSpaceBlock && spaceKind[selectedSpace]
    ? await prisma.document.findMany({
        where: {
          projectId: id,
          segmentId: selectedSpaceBlock,
          kind: selectedSpace === "planos"
            ? { in: ["PLANO", "PLANO_ACTUALIZADO"] }
            : spaceKind[selectedSpace],
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
```

2d. Line ~108 — widen the project-level planos tab `docs` query:
```ts
  const docs = activeTab === "planos"
    ? await prisma.document.findMany({ where: { projectId: id, kind: { in: ["PLANO", "PLANO_ACTUALIZADO"] } }, orderBy: { createdAt: "desc" } })
    : [];
```

- [ ] **Step 3: Verify no stale references to the "actualizados" space key.**

Run from `/Users/genel/Mirror/RECORD-360/web`:
```bash
grep -rn '"actualizados"' src/
```
Expected: no output (the enum value `PLANO_ACTUALIZADO` may appear — that is fine).

- [ ] **Step 4: Full tests and build.**

Run: `npm test && npm run build`
Expected: all tests pass (the `documents-action.test.ts` covers `PLANO_ACTUALIZADO` document creation and must still pass since the enum is untouched), build compiles.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat(spaces): merge Planos Actualizados into Planos — one dated list (R0.4)"
```

---

## Task 5: Sidebar obra counts gated to ADMIN/MANAGER (R0.6)

**Files to modify:**
- `src/components/app-sidebar.tsx` — wrap the two obra-count stats in the existing `isAdmin` prop

Context: `AppSidebar` already receives `isAdmin: boolean` (derived in `src/app/app/layout.tsx` as `role === "ADMIN" || role === "MANAGER"`). Lines 70–86 render all three stats unconditionally. Only `unread` should remain for all roles; `activeProjects` and `archivedProjects` should be gated.

- [ ] **Step 1: Gate the obra-count stats in `app-sidebar.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/app-sidebar.tsx`.

Replace the entire status `<section>` (lines 70–86, the one with `{labels.status}`) with:
```tsx
      <section className="sidebar-section">
        <div className="sidebar-heading">{labels.status}</div>
        <div className="sidebar-stats">
          {isAdmin && (
            <>
              <div className="sidebar-stat">
                <strong>{activeProjects}</strong>
                <span>{labels.activeProjects}</span>
              </div>
              <div className="sidebar-stat">
                <strong>{archivedProjects}</strong>
                <span>{labels.archivedProjects}</span>
              </div>
            </>
          )}
          <div className="sidebar-stat">
            <strong>{unread}</strong>
            <span>{labels.unread}</span>
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Build (client component — no Vitest node test needed).**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 3: Commit.**

```bash
git add -A && git commit -m "feat(sidebar): obra totals visible to ADMIN/MANAGER only (R0.6)"
```

---

## Task 6: Cambios schema + validators (TDD) (R0.10 part 1)

**Files to create/modify:**
- Create: `tests/cambios-validate.test.ts`
- Modify: `src/lib/cambios/validate.ts` (append two new exports; keep `parseRejectionReason` — it is still used by the existing resolve test for `rejectionReason`)
- Modify: `prisma/schema.prisma` (add two nullable fields to `ChangeRequest`)
- Run: `npx prisma migrate dev`

Current state of `validate.ts`: exports `parseChangeTitle` and `parseRejectionReason`. Both stay.

- [ ] **Step 1: Write the failing validator tests.**

Create `/Users/genel/Mirror/RECORD-360/web/tests/cambios-validate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseReminderDueAt, parseResolutionNote } from "@/lib/cambios/validate";

describe("parseReminderDueAt", () => {
  it("throws when empty — reminders are mandatory on change requests", () => {
    expect(() => parseReminderDueAt("")).toThrow(/obligatorio/i);
    expect(() => parseReminderDueAt(null)).toThrow(/obligatorio/i);
  });
  it("throws on garbage dates", () => {
    expect(() => parseReminderDueAt("not-a-date")).toThrow(/inválido/i);
  });
  it("parses a datetime-local value", () => {
    const d = parseReminderDueAt("2027-01-15T10:00");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2027);
  });
});

describe("parseResolutionNote", () => {
  it("throws when empty — feedback is mandatory on close", () => {
    expect(() => parseResolutionNote("")).toThrow();
  });
  it("trims and returns the note", () => {
    expect(parseResolutionNote("  Aprobado con observaciones  ")).toBe("Aprobado con observaciones");
  });
  it("rejects notes over 1000 chars", () => {
    expect(() => parseResolutionNote("x".repeat(1001))).toThrow(/largo/i);
  });
});
```

- [ ] **Step 2: Run — must fail (exports do not exist yet).**

Run: `npx vitest run tests/cambios-validate.test.ts`
Expected: FAIL — `parseReminderDueAt is not a function` or similar import error.

- [ ] **Step 3: Append the two validators to `validate.ts`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/lib/cambios/validate.ts` and append after the last line:
```ts

/**
 * Parse the mandatory reminder for a change request (datetime-local string).
 * Empty → throws (the architect requires every solicitud to carry a reminder).
 */
export function parseReminderDueAt(raw: unknown): Date {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("El recordatorio es obligatorio en una solicitud de cambio.");
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Recordatorio inválido.");
  return d;
}

/**
 * Parse the mandatory resolution feedback (observaciones) written when a
 * change request is closed — required for both integrate and reject.
 */
export function parseResolutionNote(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Escribe el feedback de la resolución.");
  if (v.length > 1000) throw new Error("El feedback es demasiado largo (máx. 1000 caracteres).");
  return v;
}
```

- [ ] **Step 4: Run tests — must pass.**

Run: `npx vitest run tests/cambios-validate.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Add the two nullable columns to `ChangeRequest` in the schema.**

Open `/Users/genel/Mirror/RECORD-360/web/prisma/schema.prisma`. In the `ChangeRequest` model, after `rejectionReason String?` add:
```prisma
  resolutionNote  String?
  reminderDueAt   DateTime?
```

The full ChangeRequest block should now have both lines:
```prisma
  rejectionReason String?
  resolutionNote  String?
  reminderDueAt   DateTime?
```

- [ ] **Step 6: Run the migration.**

Run: `npx prisma migrate dev --name cambios_reminder_feedback`
Expected: migration file created and applied, Prisma client regenerated. No errors.

- [ ] **Step 7: Full test suite.**

Run: `npm test`
Expected: all tests pass (schema change is additive — existing tests unaffected).

- [ ] **Step 8: Commit.**

```bash
git add -A && git commit -m "feat(cambios): reminder + resolution-note fields and validators (R0.10 part 1)"
```

---

## Task 7: createChangeRequest — mandatory reminder enforcement (R0.10 part 2)

**Files to modify:**
- `tests/cambios-action.test.ts` — add two new tests + update all existing `createChangeRequest` calls to supply `reminderDueAt`
- `src/app/actions/cambios.ts` — parse and persist `reminderDueAt` in `createChangeRequest`

**Prereq:** Task 6 must be committed first (the `reminderDueAt` column must exist in the DB).

Context — current `cambios-action.test.ts` key pieces:
- `fd()` helper serializes `Record<string, string | string[]>` into `FormData`. No change to the helper needed.
- `openCR(authorId, segmentIds)` calls `createChangeRequest(fd({ projectId, title, segmentIds }))` — this helper also needs `reminderDueAt`.
- Two existing tests in `createChangeRequest` describe: one creates without reminder (will now fail); one tests missing bloque.
- `resolveChangeRequest` tests use `openCR` to create the CR before resolving it.

- [ ] **Step 1: Add new tests and update existing calls in `tests/cambios-action.test.ts`.**

1a. In the `createChangeRequest` describe block (lines 55–71), add two new tests:
```ts
  it("rejects creation without a reminder — recordatorio obligatorio", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(
      createChangeRequest(fd({ projectId, title: "Sin recordatorio", segmentIds: [segmentA] })),
    ).rejects.toThrow(/recordatorio/i);
  });

  it("stores the mandatory reminder on creation", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: "Con recordatorio", segmentIds: [segmentA], reminderDueAt: "2027-03-01T09:00" }));
    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Con recordatorio" } });
    expect(cr.reminderDueAt).toBeInstanceOf(Date);
  });
```

1b. Add `reminderDueAt: "2027-01-15T10:00"` to every existing `createChangeRequest(fd({…}))` call so they continue to pass after the mandatory enforcement. Update:
- The first existing test: `fd({ projectId, title: "Refuerzo de zapata", description: "extra acero", segmentIds: [segmentA, segmentB], reminderDueAt: "2027-01-15T10:00" })`
- The missing-bloque test: `fd({ projectId, title: "x", segmentIds: [], reminderDueAt: "2027-01-15T10:00" })`
- The `openCR` helper: `fd({ projectId, title: \`T-${Math.random()}\`, segmentIds, reminderDueAt: "2027-01-15T10:00" })`

- [ ] **Step 2: Run — the new "rejects without reminder" test should fail (action doesn't enforce it yet), existing tests should pass.**

Run: `npx vitest run tests/cambios-action.test.ts`
Expected: `rejects creation without a reminder` FAILS (resolves instead); all others pass.

- [ ] **Step 3: Enforce `reminderDueAt` in `createChangeRequest` in `src/app/actions/cambios.ts`.**

3a. Change line 5 import to also include `parseReminderDueAt`:
```ts
import { parseChangeTitle, parseRejectionReason, parseReminderDueAt } from "@/lib/cambios/validate";
```

3b. After `const description = …` (line 23), add:
```ts
  const reminderDueAt = parseReminderDueAt(formData.get("reminderDueAt"));
```

3c. In the `tx.changeRequest.create({ data: { … } })` block, after `description,` add:
```ts
        reminderDueAt,
```

- [ ] **Step 4: Run — all tests must pass.**

Run: `npx vitest run tests/cambios-action.test.ts`
Expected: all pass including the two new ones.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat(cambios): reminder is mandatory at creation (R0.10 part 2)"
```

---

## Task 8: resolveChangeRequest — ADMIN resolves own + mandatory feedback + notification body (R0.10 part 3)

**Files to modify:**
- `tests/cambios-action.test.ts` — add four new resolve tests + update existing REJECT test to use `resolutionNote`
- `src/app/actions/cambios.ts` — update `resolveChangeRequest`

**Prereq:** Tasks 6 and 7 must be committed.

Current `resolveChangeRequest` logic (key lines):
- Line 81: `if (cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");` — blocks ADMIN from closing their own.
- Line 85: `const rejectionReason = parseRejectionReason(formData.get("rejectionReason"));` — parses rejection reason only for REJECT.
- Line 86: `data: { status: "REJECTED", resolvedById: user.id, resolvedAt, rejectionReason }` — does not set `resolutionNote`.
- Line 105: `data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal }` — does not set `resolutionNote`.
- Line 132: notification body is `cr.title` — should include the feedback text.
- `managerId` and `residentId` are already set up in `beforeAll`; `adminId` is NOT — we must add it to the test's `beforeAll`.

- [ ] **Step 1: Add `adminId` to the test's `beforeAll` and `afterAll`.**

In `tests/cambios-action.test.ts`:

1a. Add `adminId = ""` to the let declaration at line 12:
```ts
let companyId = "", managerId = "", adminId = "", residentId = "", projectId = "", segmentA = "", segmentB = "", pA = "", pB = "";
```

1b. In `beforeAll`, after the `managerId = …` line, add:
```ts
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
```

1c. In `afterAll`, change `where: { id: { in: [managerId, residentId] } }` to include `adminId`:
```ts
  await prisma.user.deleteMany({ where: { id: { in: [managerId, adminId, residentId] } } });
```

1d. Update `openCR` so it correctly infers ADMIN role:
```ts
async function openCR(authorId: string, segmentIds: string[]) {
  const role = authorId === managerId ? "MANAGER" : authorId === adminId ? "ADMIN" : "RESIDENT";
  authMock.mockResolvedValue({ user: { id: authorId, companyId, role } });
  await createChangeRequest(fd({ projectId, title: `T-${Math.random()}`, segmentIds, reminderDueAt: "2027-01-15T10:00" }));
  return prisma.changeRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { projectId } });
}
```

- [ ] **Step 2: Update the existing REJECT test to use `resolutionNote` field name.**

Find the test "REJECT marks rejected with reason…" (line 107). Change:
```ts
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", rejectionReason: "No corresponde al alcance." }));
```
to:
```ts
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", resolutionNote: "No corresponde al alcance." }));
```
And update the assertion:
```ts
    expect(after.rejectionReason).toBe("No corresponde al alcance.");
```
remains (it should now also be mirrored from `resolutionNote`).

Also update the "REJECT requires a reason" test (line 118):
```ts
    await expect(resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT" }))).rejects.toThrow(/feedback/i);
```
(the new error message says "feedback" not "motivo").

- [ ] **Step 3: Add four new tests to the `resolveChangeRequest` describe block.**

```ts
  it("ADMIN may resolve their own request (small-team reality) with mandatory feedback", async () => {
    const cr = await openCR(adminId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE", resolutionNote: "Aprobado en sitio" }));
    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("INTEGRATED");
    expect(after.resolutionNote).toBe("Aprobado en sitio");
  });

  it("MANAGER still cannot resolve their own request", async () => {
    const cr = await openCR(managerId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(
      resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE", resolutionNote: "x" })),
    ).rejects.toThrow(/propia/i);
  });

  it("rejects resolution without feedback — observaciones obligatorias", async () => {
    const cr = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(
      resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" })),
    ).rejects.toThrow(/feedback/i);
  });

  it("REJECT stores resolutionNote mirrored to rejectionReason and notifies with the feedback text", async () => {
    const cr = await openCR(residentId, [segmentB]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", resolutionNote: "Falta presupuesto" }));
    const after = await prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.resolutionNote).toBe("Falta presupuesto");
    expect(after.rejectionReason).toBe("Falta presupuesto");
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: cr.authorId, type: "cambio.resolved", link: { contains: cr.id } },
    });
    expect(note.body).toContain("Falta presupuesto");
  });
```

- [ ] **Step 4: Run — new tests fail.**

Run: `npx vitest run tests/cambios-action.test.ts`
Expected: the four new tests FAIL (ADMIN still blocked; feedback not required; `resolutionNote` not stored; notification body is still `cr.title`). The existing tests should still pass if step 2 changes are correct.

- [ ] **Step 5: Update `resolveChangeRequest` in `src/app/actions/cambios.ts`.**

5a. Change the `parseRejectionReason` import line (line 5) to also include `parseResolutionNote`:
```ts
import { parseChangeTitle, parseRejectionReason, parseReminderDueAt, parseResolutionNote } from "@/lib/cambios/validate";
```

5b. Replace the author-exclusion guard (line 81):
```ts
  // 4-eyes when possible: a MANAGER cannot close their own solicitud. ADMIN may
  // (small companies often have a single admin who also files requests).
  if (user.role !== Role.ADMIN && cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");
```

5c. After the author-exclusion guard, parse the resolution note ONCE before the branches:
```ts
  const resolutionNote = parseResolutionNote(formData.get("resolutionNote"));
```

5d. REJECT branch (line 84–86) — update to store `resolutionNote` and mirror to `rejectionReason`:
```ts
  if (action === "REJECT") {
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt, rejectionReason: resolutionNote, resolutionNote } });
  } else if (action === "INTEGRATE") {
```

(Remove the old `const rejectionReason = parseRejectionReason(…)` line that was inside the REJECT block.)

5e. INTEGRATE branch — in `tx.changeRequest.update` data (line ~105), add `resolutionNote,` after `seal`:
```ts
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal, resolutionNote } });
```

5f. Notification body (line ~132) — use the feedback text:
```ts
    body: `${cr.title} — ${resolutionNote}`,
```

- [ ] **Step 6: Run — all tests must pass.**

Run: `npx vitest run tests/cambios-action.test.ts tests/cambios-validate.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "feat(cambios): admin may close own request; feedback mandatory and notified (R0.10 part 3)"
```

---

## Task 9: Cambios UI — reminder field + feedback forms + admin button visible (R0.10 part 4)

**Files to modify:**
- `src/i18n/dictionaries.ts` — add `reminder` and `feedback` keys to `changes` block (both locales)
- `src/components/cambios-create.tsx` — add `reminder: string` to type `T`; add datetime-local input
- `src/app/app/projects/[id]/cambios/[crId]/page.tsx` — fix `canResolve`, add reminder display, replace reject-only reason block with unified feedback block, update INTEGRATE form to have a feedback textarea, rename REJECT form field to `resolutionNote`
- `src/components/cambios-list.tsx` — pass `reminder` string from its `t` prop into `CambiosCreate`

**Prereq:** Tasks 6, 7, and 8 must be committed.

Context:
- `CambiosCreate` is rendered by `CambiosList`, which re-exports its `t` type via `React.ComponentProps<typeof CambiosCreate>["t"]`. Anything added to `CambiosCreate`'s `T` type will automatically require a matching key in `CambiosList`'s `t` prop.
- `CambiosList` is called in `projects/[id]/page.tsx` with `t={{ …, fieldTitle: t.changes.fieldTitle, … }}` — that object will need the new `reminder` key too.
- `cambios/[crId]/page.tsx` currently shows: `canResolve = isManager && OPEN && authorId !== u.id`, which hides the button for ADMIN authoring their own CR. We relax this.

- [ ] **Step 1: Add the two new dictionary strings (both locales).**

Open `/Users/genel/Mirror/RECORD-360/web/src/i18n/dictionaries.ts`.

In the ES `changes` block, after `rejectionReason: "Motivo del rechazo",` add:
```ts
      reminder: "Recordatorio (obligatorio)",
      feedback: "Feedback / Observaciones",
```

In the EN `changes` block, after `rejectionReason: "Rejection reason",` add:
```ts
      reminder: "Reminder (required)",
      feedback: "Feedback / Notes",
```

- [ ] **Step 2: Add reminder field to `CambiosCreate`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/cambios-create.tsx`.

2a. Add `reminder: string;` to type `T`:
```ts
type T = {
  new: string; fieldTitle: string; fieldDescription: string; fieldPartidas: string;
  evidence: string; gps: string; gpsOk: string; reminder: string;
};
```

2b. After the `<select name="segmentIds" …>` closing tag (line ~34), insert:
```tsx
      <label className="form-label" style={{ display: "block", marginBottom: 4 }}>
        {t.reminder}
        <input
          type="datetime-local"
          name="reminderDueAt"
          required
          min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
          className="input"
          style={{ display: "block", marginTop: 4, width: 210 }}
        />
      </label>
```

- [ ] **Step 3: Pass `reminder` from `projects/[id]/page.tsx` down to `CambiosList`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/app/app/projects/[id]/page.tsx`.

Find the `<CambiosList … t={{ … }}>` call (~line 253–264). Add `reminder: t.changes.reminder,` to the `t` object. Example — the object currently ends with `gps: t.composer.gps, gpsOk: t.composer.gpsOk,` — add the new key after it:
```ts
              gps: t.composer.gps, gpsOk: t.composer.gpsOk,
              reminder: t.changes.reminder,
```

- [ ] **Step 4: Fix `canResolve` and update the detail page.**

Open `/Users/genel/Mirror/RECORD-360/web/src/app/app/projects/[id]/cambios/[crId]/page.tsx`.

4a. Line 34 — relax author-exclusion for ADMIN:
```ts
  const canResolve = cr.status === "OPEN" && (u.role === "ADMIN" || (u.role === "MANAGER" && cr.authorId !== u.id));
```

4b. After the `<Field label={C.requester}>` block (~line 54–57), add the reminder display (uses `C.reminder` which must exist in the changes dictionary — just added in Step 1):
```tsx
        {cr.reminderDueAt && (
          <Field label={C.reminder}>{formatTimestamp(cr.reminderDueAt, lang as Lang)}</Field>
        )}
```

4c. Replace the REJECTED-only reason block (lines 71–73):
```tsx
        {cr.status === "REJECTED" && cr.rejectionReason && (
          <Field label={C.rejectionReason}>{cr.rejectionReason}</Field>
        )}
```
with a unified feedback display that shows for both INTEGRATED and REJECTED:
```tsx
        {cr.status !== "OPEN" && (cr.resolutionNote ?? cr.rejectionReason) && (
          <Field label={C.feedback}>{cr.resolutionNote ?? cr.rejectionReason}</Field>
        )}
```

4d. Replace the entire `{canResolve && …}` block with forms that include feedback textareas and use the new `resolutionNote` field name:
```tsx
        {canResolve && (
          <div className="cr-actions">
            <form action={resolveChangeRequest}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="INTEGRATE" />
              <textarea name="resolutionNote" required rows={2} className="input" placeholder={C.feedback} style={{ minWidth: 220, resize: "vertical" }} />
              <SubmitButton className="btn" style={{ background: "var(--state-merged)", color: "#fff" }}>{C.integrate}</SubmitButton>
            </form>
            <form action={resolveChangeRequest}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="REJECT" />
              <textarea name="resolutionNote" required rows={2} className="input" placeholder={C.feedback} style={{ minWidth: 220, resize: "vertical" }} />
              <SubmitButton className="btn btn-ghost">{C.reject}</SubmitButton>
            </form>
            <span className="mono text-steel" style={{ fontSize: "0.62rem", marginLeft: "auto", alignSelf: "center" }}>{C.managerOnly}</span>
          </div>
        )}
```

Note: `C.feedback` uses the new key added in Step 1. `C.reminder` also needs to be accessible — the detail page already has `const C = t.changes;` so it will pick up any new keys automatically.

- [ ] **Step 5: Full tests and build.**

Run: `npm test && npm run build`
Expected: all tests pass, build compiles cleanly.

- [ ] **Step 6: Commit.**

```bash
git add -A && git commit -m "feat(cambios): reminder field, feedback forms, admin close button visible (R0.10 part 4)"
```

---

## Task 10: Notifications on permanent deletes (R0.9)

**Files to create/modify:**
- Create: `tests/purge-notifications.test.ts`
- Modify: `src/app/actions/admin.ts` — add notifications after `purgeProject`
- Modify: `src/app/actions/partida-crud.ts` — add notifications after `purgePartida`

Context of `purgeProject` (admin.ts lines 96–128):
- Uses `requireSession()` (NOT `requireFreshSession`) — same pattern is correct.
- The `project` variable is read before the transaction.
- After the transaction, it calls `revalidatePath("/app")`.
- Uses `writeAudit` inside the transaction.
- `createNotifications` is already imported in `cambios.ts` at `@/lib/notifications/create`. We add the same import here.
- `NewNotification` needs: `companyId, userId, type, title, body?, link?`.

Context of `purgePartida` (partida-crud.ts lines 65–87):
- Uses `requireSession()`.
- `p` is the partida (`ownedPartida` returns it with `projectId` and `name`).
- After the transaction, calls `revalidatePath`.

Note on `auditLog` in `afterAll`: if `AuditLog` model exists (it does — `prisma/schema.prisma` line 305), clean it up in `afterAll`. If `projectAssignment` relation has cascade delete, `deleteMany({ where: { project: { companyId } } })` may fail because the project was already deleted — reorder cleanup or check cascade. Safe order: notifications → auditLogs → projectAssignments → partidas → project → users → company.

- [ ] **Step 1: Write the failing tests.**

Create `/Users/genel/Mirror/RECORD-360/web/tests/purge-notifications.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { purgeProject } from "@/app/actions/admin";
import { purgePartida } from "@/app/actions/partida-crud";

let companyId = "", adminId = "", managerId = "", residentId = "";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Purge Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.projectAssignment.deleteMany({ where: { project: { companyId } } });
  await prisma.partida.deleteMany({ where: { project: { companyId } } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("permanent deletes create notifications", () => {
  it("purgeProject notifies MANAGER and assigned users; NOT the actor (ADMIN)", async () => {
    const project = await prisma.project.create({
      data: { companyId, name: "Obra a borrar", archivedAt: new Date() },
    });
    await prisma.projectAssignment.create({ data: { projectId: project.id, userId: residentId, role: "RESIDENT" } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

    await purgeProject(fd({ projectId: project.id }));

    const mgrNote = await prisma.notification.findFirst({ where: { userId: managerId, type: "delete.permanent" } });
    const resNote = await prisma.notification.findFirst({ where: { userId: residentId, type: "delete.permanent" } });
    const actorNote = await prisma.notification.findFirst({ where: { userId: adminId, type: "delete.permanent" } });
    expect(mgrNote?.title).toContain("Obra a borrar");
    expect(resNote).not.toBeNull();
    expect(actorNote).toBeNull();
  });

  it("purgePartida notifies MANAGER with the partida name", async () => {
    const project = await prisma.project.create({ data: { companyId, name: "Obra viva" } });
    const partida = await prisma.partida.create({
      data: { projectId: project.id, name: "Partida fantasma", deletedAt: new Date(), deletedById: adminId },
    });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

    await purgePartida(fd({ partidaId: partida.id }));

    const mgrNote = await prisma.notification.findFirst({
      where: { userId: managerId, type: "delete.permanent", title: { contains: "Partida fantasma" } },
    });
    expect(mgrNote).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — must fail (no notifications written yet).**

Run: `npx vitest run tests/purge-notifications.test.ts`
Expected: FAIL — `mgrNote` is null.

- [ ] **Step 3: Implement notifications in `purgeProject` (`src/app/actions/admin.ts`).**

3a. Add import at the top of the file (after existing imports):
```ts
import { createNotifications } from "@/lib/notifications/create";
```

3b. Inside `purgeProject`, BEFORE the transaction, collect recipients and actor name:
```ts
  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: id }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: actorId }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((uid) => uid !== actorId);
```

3c. AFTER the transaction (after `revalidatePath("/app")`), send notifications:
```ts
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Obra borrada definitivamente: ${project.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
```

Note: `disabledAt` — check if `User` model has this field with `grep -n "disabledAt" prisma/schema.prisma`. If not present, remove `disabledAt: null` from the where clause.

- [ ] **Step 4: Implement notifications in `purgePartida` (`src/app/actions/partida-crud.ts`).**

4a. Add import (after existing imports):
```ts
import { createNotifications } from "@/lib/notifications/create";
```

4b. Inside `purgePartida`, BEFORE the transaction:
```ts
  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] } }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: p.projectId }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: uid }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((rid) => rid !== uid);
```

4c. AFTER the transaction (after the last `revalidatePath`):
```ts
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Partida borrada definitivamente: ${p.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
```

Note: check imports in `partida-crud.ts` — it should already import `Role` from `@prisma/client`. If not, add it.

- [ ] **Step 5: Run — must pass; then full suite.**

Run: `npx vitest run tests/purge-notifications.test.ts && npm test`
Expected: both purge tests pass; full suite green.

- [ ] **Step 6: Commit.**

```bash
git add -A && git commit -m "feat(notifications): permanent deletes notify staff and assigned users (R0.9)"
```

---

## Task 11: Surface "Borrar obra" on the project page (R0.8)

**Files to modify:**
- `src/i18n/dictionaries.ts` — add three keys to `project` block (both locales)
- `src/app/app/projects/[id]/page.tsx` — add the archive/restore/purge control row after the project subtitle line
- `src/app/actions/admin.ts` — add `redirect` after `purgeProject`, and add `revalidatePath` for the project route in `archiveProject`/`restoreProject`

**Prereq:** Task 10 must be committed (so `purgeProject` already has notifications).

Context:
- `PurgeProjectButton` and `ArchiveButton` components already exist (`src/components/purge-project-button.tsx`, `src/components/archive-button.tsx`) with the expected `t` prop shapes:
  - `PurgeProjectButton`: `{ purge: string; purgeConfirm: string; yes: string; no: string }`
  - `ArchiveButton`: `{ archive: string; confirm: string; yes: string; no: string }`
- `restoreProject` action exists in `admin.ts`.
- `isOwner` is already computed in the page as `sessionUser.role === "ADMIN"`.

- [ ] **Step 1: Add dictionary strings.**

Open `/Users/genel/Mirror/RECORD-360/web/src/i18n/dictionaries.ts`.

In the ES `project` block, after `hasRecords: "Contiene registros (no se puede borrar)",` add:
```ts
      dangerArchiveHint: "Para borrar una obra definitivamente, primero archívala. Solo se pueden borrar obras vacías (sin partidas, cambios ni documentos).",
      dangerArchivedHint: "Obra archivada. Si está vacía, puedes borrarla definitivamente.",
      restoreProject: "Restaurar obra",
```

In the EN `project` block, after `hasRecords: "Has entries (cannot delete)",` add:
```ts
      dangerArchiveHint: "To delete a site permanently, archive it first. Only empty sites (no work items, changes or documents) can be deleted.",
      dangerArchivedHint: "Archived site. If it is empty, you can delete it permanently.",
      restoreProject: "Restore site",
```

- [ ] **Step 2: Add the control row to the project page.**

Open `/Users/genel/Mirror/RECORD-360/web/src/app/app/projects/[id]/page.tsx`.

2a. Add imports near the top (after the existing action/component imports):
```ts
import { restoreProject } from "@/app/actions/admin";
```
(`ArchiveButton` and `PurgeProjectButton` are probably not imported yet — add them too):
```ts
import { ArchiveButton } from "@/components/archive-button";
import { PurgeProjectButton } from "@/components/purge-project-button";
```

2b. Find the `<div className="mono text-steel" …>{project.company.name} · …</div>` line (~line 229). Immediately after it, insert:
```tsx
      {isOwner && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <span className="mono text-steel" style={{ fontSize: "0.7rem" }}>
            {project.archivedAt ? P.dangerArchivedHint : P.dangerArchiveHint}
          </span>
          {project.archivedAt ? (
            <>
              <form action={restoreProject} style={{ display: "inline" }}>
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.restoreProject}</button>
              </form>
              <PurgeProjectButton projectId={project.id} t={{ purge: t.dash.purge, purgeConfirm: t.dash.purgeConfirm, yes: t.dash.yes, no: t.dash.no }} />
            </>
          ) : (
            <ArchiveButton projectId={project.id} t={{ archive: t.dash.archive, confirm: t.dash.confirm, yes: t.dash.yes, no: t.dash.no }} />
          )}
        </div>
      )}
```

- [ ] **Step 3: Update `purgeProject` to redirect after success and `archiveProject`/`restoreProject` to revalidate the project page.**

Open `/Users/genel/Mirror/RECORD-360/web/src/app/actions/admin.ts`.

3a. Ensure `redirect` is imported from `"next/navigation"` — check line 1–10. If not already there, add:
```ts
import { redirect } from "next/navigation";
```

3b. In `purgeProject`, after the `createNotifications(…)` call (the last line you added in Task 10), add:
```ts
  redirect("/app");
```

3c. In `archiveProject` (find by `export async function archiveProject`), after `revalidatePath("/app");` add:
```ts
  revalidatePath(`/app/projects/${id}`);
```

3d. In `restoreProject`, after `revalidatePath("/app");` add:
```ts
  revalidatePath(`/app/projects/${id}`);
```

- [ ] **Step 4: Update the `purge-notifications` test to swallow the redirect.**

The `purgeProject` call in `tests/purge-notifications.test.ts` now throws `NEXT_REDIRECT` after the notifications are created. Update it:

```ts
    await purgeProject(fd({ projectId: project.id })).catch((e: unknown) => {
      // purgeProject redirects after success — swallow it
      const isRedirect = (e instanceof Error && e.message === "NEXT_REDIRECT") ||
        ((e as { digest?: string }).digest?.startsWith?.("NEXT_REDIRECT") ?? false);
      if (!isRedirect) throw e;
    });
```

- [ ] **Step 5: Full tests and build.**

Run: `npm test && npm run build`
Expected: all pass, build compiles.

- [ ] **Step 6: Commit.**

```bash
git add -A && git commit -m "feat(project): surface archive/restore/borrar-obra with double confirm on the project page (R0.8)"
```

---

## Task 12: Manager-content regression tests — close R0.7 by verification

**Files to create:**
- Create: `tests/manager-content.test.ts`

Before writing this test, open two reference files to understand the exact invocation shape for `createDocument` and `logRegistro`:
- `tests/documents-action.test.ts` — how `createDocument` is called, what FormData fields it expects, what it returns
- `tests/registro-action-correction.test.ts` — how `logRegistro` is called, what FormData fields, what it returns

Use EXACTLY those field names and return-value assertions — do not guess.

- [ ] **Step 1: Read the reference tests.**

Read `/Users/genel/Mirror/RECORD-360/web/tests/documents-action.test.ts` to find:
- The FormData fields used for `createDocument` (especially `file`, `projectId`, `kind`, `title`)
- The return value shape (e.g., `{ ok: true }` or void)
- The storage mock pattern (there may be a `vi.mock("@/lib/storage")` setup)

Read `/Users/genel/Mirror/RECORD-360/web/tests/registro-action-correction.test.ts` to find:
- The FormData fields for `logRegistro` (`partidaId`, `text`, etc.)
- The return value shape

- [ ] **Step 2: Write the test.**

Create `/Users/genel/Mirror/RECORD-360/web/tests/manager-content.test.ts` using the exact invocation patterns observed in Step 1. The test must:
- Create a MANAGER user who is NOT assigned to the project (that's the regression being locked)
- Call `createDocument` with a minimal valid file and assert the document was created
- Call `logRegistro` with text and assert the registro was created

Skeleton (fill in exact field names and return-value assertions from Step 1):
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
// Add vi.mock("@/lib/storage") if the reference test does it — copy exactly

import { createDocument } from "@/app/actions/documents";
import { logRegistro } from "@/app/actions/registro";

let companyId = "", managerId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `MgrUp Co ${s}` } })).id;
  // Deliberately NOT assigned to the project.
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Gerente", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `MgrUp Obra ${s}` } })).id;
  partidaId = (await prisma.partida.create({ data: { projectId, name: "Losa N1" } })).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.attachment.deleteMany({ where: { registro: { partidaId } } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("unassigned MANAGER can publish content (R0.7 regression lock)", () => {
  it("uploads a document into a space", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    // ... use the exact FormData shape from documents-action.test.ts
    // assert the document was created and uploadedById === managerId
  });

  it("posts a registro in the cuaderno", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    // ... use the exact FormData shape from registro-action-correction.test.ts
    // assert the registro was created and authorId === managerId
  });
});
```

- [ ] **Step 3: Run.**

Run: `npx vitest run tests/manager-content.test.ts`
Expected: PASS (both tests green — closes R0.7 by verification). **If either fails**, you have found the actual gap. Fix it minimally at the failing authorization gate, re-run, and note the real root cause in the commit message.

- [ ] **Step 4: Commit.**

```bash
git add -A && git commit -m "test(authz): lock manager content publishing — closes R0.7 by verification"
```

---

## Task 13: Icon sweep part 1 (R0.11)

**Files to modify:**
- `src/components/icons.tsx` — append 4 new icon exports
- `src/components/purge-project-button.tsx` — add Trash icon
- `src/components/archive-button.tsx` — add Archive icon
- `src/components/planos-upload.tsx` — add Upload icon
- `src/components/cambios-create.tsx` — add ClipboardPlus icon

Context — existing `icons.tsx` pattern (first few lines):
```tsx
export type IconProps = { size?: number; className?: string; style?: CSSProperties };
function base(size: number) { return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const; }
```
Every new icon must follow exactly this pattern.

Read each target component before editing to confirm the import location and where the icon should be inserted. Never guess line numbers.

- [ ] **Step 1: Append four icons to `icons.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/icons.tsx` and append after the last export:
```tsx
export function Trash({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function Archive({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

export function Upload({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 9 12 4 17 9" />
      <line x1="12" y1="4" x2="12" y2="16" />
    </svg>
  );
}

export function ClipboardPlus({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
      <path d="M12 10v6M9 13h6" />
    </svg>
  );
}
```

- [ ] **Step 2: Add Trash icon to `purge-project-button.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/purge-project-button.tsx`. Add import:
```ts
import { Trash } from "@/components/icons";
```
Find the initial (non-confirming) button content and prepend the icon before `{t.purge}`:
```tsx
        <Trash size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{t.purge}
```

- [ ] **Step 3: Add Archive icon to `archive-button.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/archive-button.tsx`. Add import:
```ts
import { Archive } from "@/components/icons";
```
Find the initial archive button content and prepend:
```tsx
        <Archive size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{t.archive}
```

- [ ] **Step 4: Add Upload icon to `planos-upload.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/planos-upload.tsx`. Add import:
```ts
import { Upload } from "@/components/icons";
```
Find the SubmitButton content and prepend:
```tsx
        <Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.upload}
```

- [ ] **Step 5: Add ClipboardPlus icon to `cambios-create.tsx`.**

Open `/Users/genel/Mirror/RECORD-360/web/src/components/cambios-create.tsx`. Add import:
```ts
import { ClipboardPlus } from "@/components/icons";
```
Find the SubmitButton content (currently `{t.new}`) and change to:
```tsx
        <ClipboardPlus size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.new}
```

- [ ] **Step 6: Build and lint.**

Run: `npm run lint && npm run build`
Expected: lint clean, build compiles.

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "feat(ui): representative line icons on destructive/upload/cambio actions (R0.11 part 1)"
```

---

## Task 14: Final verification gate

- [ ] **Step 1: Full test + lint + build.**

Run from `/Users/genel/Mirror/RECORD-360/web`:
```bash
npm test && npm run lint && npm run build
```
Expected: all tests pass, lint clean, build compiles. Note the total test count in the report.

- [ ] **Step 2: Push the branch.**

```bash
git push
```

---

## Self-review

**Spec coverage:**
- R0.4 → Task 4 (Planos merge)
- R0.6 → Task 5 (sidebar gating)
- R0.7 → Task 12 (verification regression lock)
- R0.8 → Task 11 (borrar-obra surface)
- R0.9 → Task 10 (purge notifications)
- R0.10 → Tasks 6 + 7 + 8 + 9 (schema, validators, create-enforcement, resolve-enforcement, UI)
- R0.11 → Task 13 (icon sweep part 1)

**Known judgment calls:**
- `resolutionNote` is mirrored to `rejectionReason` on REJECT for back-compat with any existing query that reads `rejectionReason`.
- `parseRejectionReason` is kept in `validate.ts` — it is still referenced by the REJECT test's error message assertion until Task 8 updates it, and keeping it doesn't hurt.
- `purgeProject` redirect throws `NEXT_REDIRECT`; the purge-notifications test swallows it (Task 11 step 4).
- `disabledAt` field on User: must verify existence before using in Task 10 step 3 where clause.
- Task 12 skeleton is intentionally left for the agent to fill from the reference tests — the exact field names and storage mock pattern must be copied from the reference files, not guessed.

**Type consistency across tasks:**
- `parseReminderDueAt` and `parseResolutionNote`: defined in Task 6, imported in Tasks 7 and 8 using the same names.
- `uploadByKind: Record<DocumentKind, string>`: defined in Tasks 2/3 (already committed), referenced in bloque-spaces-panel.
- `delete.permanent` notification type: string constant used in Task 10 actions and Task 10 test assertions — consistent.
- `C.reminder` and `C.feedback`: added to dictionaries in Task 9 Step 1, consumed in `CambiosCreate` (Step 2) and `cambios/[crId]/page.tsx` (Step 4) via `const C = t.changes`.
