# Raphel R0 — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Round 0 of the architect's round-2 feedback: Raphel rename, phase labels, per-space upload labels, Planos merge, role descriptions, sidebar gating, cambios fixes (mandatory reminder, admin resolve, required feedback), purge notifications, borrar-obra surfacing, manager-upload verification, icon sweep.

**Architecture:** All changes ride existing patterns — dictionary-driven i18n (`src/i18n/dictionaries.ts`, ES default + EN), server actions with `requireFreshSession` + authz helpers, vitest node tests in `tests/` hitting a real Postgres via Prisma with `vi.mock("@/auth")`. One additive migration (ChangeRequest gets `reminderDueAt` + `resolutionNote`). No destructive schema changes.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (PostgreSQL), NextAuth v5, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md`

**Working directory:** `/Users/genel/Mirror/RECORD-360/web` (run all commands from here unless noted). Branch: `feat/web-security-hardening` (continue on it).

**Hard rules:**
- NO emoji anywhere in UI — monochrome SVG icons from `src/components/icons.tsx` only.
- Every new user-facing string goes in BOTH `es` and `en` blocks of `dictionaries.ts`.
- Lowercase `raphl:` event names (e.g. `raphl:queue-changed` in `sync-indicator.tsx`, `pending-entries.tsx`, `offline-provider.tsx`, `lib/offline/queue.ts`, `log-composer.tsx`) are internal identifiers — **do NOT rename them**; renaming would orphan queued offline data and break event wiring for zero user-visible benefit.

---

### Task 0: Amend spec R0.7 (root cause was wrong)

**Files:**
- Modify: `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md` (the R0.7 section)

During plan research we proved the spec's R0.7 claim wrong: `isAdmin` on both pages is `hasCompanyWideAccess(role)` (ADMIN **and** MANAGER), so `canEditStructure` already grants unassigned managers upload rights, and the server actions (`createDocument` → `canAccessProject`, `logRegistro` → `projectAccessWhere`) also permit MANAGER.

- [ ] **Step 1: Replace the R0.7 section body** with:

```markdown
### R0.7 Manager can upload in spaces
> *"El gerente de proyectos debe de poder subir contenido en los distintos espacios."*

**Now (verified during planning):** code already permits this everywhere — UI gate
`canEditStructure = hasCompanyWideAccess(role) || assigned` (`projects/[id]/page.tsx:65`)
and server gates (`createDocument` → `canAccessProject`; `logRegistro` →
`projectAccessWhere`) all include MANAGER. The architect's report most likely came
from testing with an account whose role wasn't actually MANAGER (seed only creates
admin@record360.do/ADMIN).
**Fix:** lock the behavior with regression tests (unassigned MANAGER can upload a
document and post a registro). If a test fails, fix the revealed gap; if green, the
item is closed-by-verification and the user should double-check the architect's
test-account role.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360
git add docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md
git commit -m "docs(spec): correct R0.7 root cause — manager upload already permitted, verify with tests"
```

---

### Task 1: Rename Raphl → Raphel (TDD via branding test)

**Files:**
- Modify: `tests/branding.test.ts`, `tests/email.test.ts`
- Modify: `src/i18n/dictionaries.ts:7,266` · `src/app/layout.tsx:13,15` · `src/app/manifest.ts:4,7,8` · `src/app/app/layout.tsx:38` · `src/app/page.tsx:14,101` · `src/app/login/page.tsx:31` · `src/components/app-sidebar.tsx:47` · `src/lib/email/templates.ts:3`

- [ ] **Step 1: Update the branding test to expect Raphel** — replace the first `it` in `tests/branding.test.ts` and add a no-leftovers check ("Raphel" does not contain the substring "Raphl", so this is safe):

```ts
describe("Raphel branding", () => {
  it("uses Raphel as the app name in both locales", () => {
    expect(dictionaries.es.common.app).toBe("Raphel");
    expect(dictionaries.en.common.app).toBe("Raphel");
  });

  it("has no leftover 'Raphl' or 'RECORD 360' product name in i18n copy", () => {
    const json = JSON.stringify(dictionaries);
    expect(json).not.toContain("Raphl");
    expect(json).not.toContain("RECORD 360");
  });
});
```

(Keep the existing comment about the seeded demo credential.)

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run tests/branding.test.ts`
Expected: FAIL — `expected 'Raphl' to be 'Raphel'`

- [ ] **Step 3: Rename every user-visible brand string.** Exact edits (old → new):

| File:line | Old | New |
|---|---|---|
| `src/i18n/dictionaries.ts:7` | `common: { app: "Raphl", …` | `common: { app: "Raphel", …` |
| `src/i18n/dictionaries.ts:266` | same | same |
| `src/app/layout.tsx:13` | `title: "Raphl — La caja negra de tu obra"` | `title: "Raphel — La caja negra de tu obra"` |
| `src/app/layout.tsx:15` | `appleWebApp: { capable: true, title: "Raphl", …` | `…title: "Raphel", …` |
| `src/app/manifest.ts:4` | `// Makes Raphl installable…` | `// Makes Raphel installable…` |
| `src/app/manifest.ts:7` | `name: "Raphl — La caja negra de tu obra",` | `name: "Raphel — La caja negra de tu obra",` |
| `src/app/manifest.ts:8` | `short_name: "Raphl",` | `short_name: "Raphel",` |
| `src/app/app/layout.tsx:38` | `<b>Raphl<span className="dot"…` | `<b>Raphel<span className="dot"…` |
| `src/app/page.tsx:14` | `<b>Raphl<span…` | `<b>Raphel<span…` |
| `src/app/page.tsx:101` | `<b>Raphl<span…` | `<b>Raphel<span…` |
| `src/app/login/page.tsx:31` | `<b>Raphl<span…` | `<b>Raphel<span…` |
| `src/components/app-sidebar.tsx:47` | `<div className="kicker">Raphl</div>` | `<div className="kicker">Raphel</div>` |
| `src/lib/email/templates.ts:3` | `const APP_NAME = "Raphl";` | `const APP_NAME = "Raphel";` |

Also update the test fixture in `tests/email.test.ts:17,26`: `"Raphl <no-reply@raphl.app>"` → `"Raphel <no-reply@raphel.app>"` (both lines must match each other — it's a self-consistent fixture).

- [ ] **Step 4: Verify nothing user-visible is left** (only `raphl:` event names may remain):

Run: `grep -rn "Raphl" src tests`
Expected: no output.
Run: `grep -rn "raphl" src | grep -v "raphl:"`
Expected: no output (event names are the only lowercase survivors).

- [ ] **Step 5: Full test run**

Run: `npm test`
Expected: all pass (208+).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(brand): rename Raphl to Raphel across UI, manifest, emails (R0.1)"
```

---

### Task 2: Health-bar phase labels + expanded role descriptions

**Files:**
- Create: `tests/dictionary-labels.test.ts`
- Modify: `src/i18n/dictionaries.ts` (dash.analytics* lines 82–84 & 341–343; admin.roleDescs lines 241–246 & 499–504)

- [ ] **Step 1: Write the failing test** — create `tests/dictionary-labels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

describe("portfolio health phase labels (architect round 2)", () => {
  it("names the color bands as construction phases in Spanish", () => {
    expect(dictionaries.es.dash.analyticsRed).toBe("Fase de Definición");
    expect(dictionaries.es.dash.analyticsYellow).toBe("Fase de Avance");
    expect(dictionaries.es.dash.analyticsGreen).toBe("Fase de Terminación");
  });
  it("names the color bands as phases in English", () => {
    expect(dictionaries.en.dash.analyticsRed).toBe("Definition phase");
    expect(dictionaries.en.dash.analyticsYellow).toBe("Progress phase");
    expect(dictionaries.en.dash.analyticsGreen).toBe("Completion phase");
  });
});

describe("role descriptions include scope and synonyms", () => {
  it("every role description is substantive (scope + synonyms) in both locales", () => {
    for (const lang of ["es", "en"] as const) {
      for (const role of ["ADMIN", "MANAGER", "SUPERVISOR", "RESIDENT"] as const) {
        const desc = dictionaries[lang].admin.roleDescs[role];
        expect(desc.length).toBeGreaterThan(80);
        expect(desc).toMatch(/\(/); // has the synonyms parenthetical
      }
    }
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run tests/dictionary-labels.test.ts`
Expected: FAIL — `expected 'En rojo' to be 'Fase de Definición'`

- [ ] **Step 3: Edit the dictionary.** ES block (lines 82–84):

```ts
      analyticsGreen: "Fase de Terminación",
      analyticsYellow: "Fase de Avance",
      analyticsRed: "Fase de Definición",
```

EN block (lines 341–343):

```ts
      analyticsGreen: "Completion phase",
      analyticsYellow: "Progress phase",
      analyticsRed: "Definition phase",
```

ES `admin.roleDescs` (replace the whole object):

```ts
      roleDescs: {
        ADMIN: "Control total de la plataforma. Crea y borra obras, gestiona el equipo, los roles y la configuración, cierra solicitudes de cambio y accede a todas las obras, incluidas las archivadas. (Sinónimos: Administrador general, Dueño de la cuenta)",
        MANAGER: "Gerencia de proyectos. Ve todas las obras de la compañía, aprueba o rechaza solicitudes de cambio, sube planos y documentos en todos los espacios y genera reportes ejecutivos. (Sinónimos: Gerente general, Gerente de proyectos, Director de obra)",
        SUPERVISOR: "Supervisión y control de calidad de las obras a las que está asignado. Valida lo reportado por el residente, registra observaciones y avances, y da seguimiento a los recordatorios pendientes. (Sinónimos: Supervisor de obra, Encargado de QA)",
        RESIDENT: "Lleva el día a día de la obra asignada. Crea y actualiza partidas, registra notas, fotos, videos y avances desde el campo, y solicita cambios cuando la obra lo requiere. (Sinónimos: Residente de obra, Ingeniero residente)",
      },
```

EN `admin.roleDescs`:

```ts
      roleDescs: {
        ADMIN: "Full platform control. Creates and deletes sites, manages the team, roles and settings, closes change requests and can access every site, including archived ones. (Synonyms: General administrator, Account owner)",
        MANAGER: "Project management. Sees every site in the company, approves or rejects change requests, uploads blueprints and documents in all spaces and generates executive reports. (Synonyms: General manager, Project manager, Site director)",
        SUPERVISOR: "Supervision and quality control of assigned sites. Validates what the resident reports, logs observations and progress, and follows up on pending reminders. (Synonyms: Site supervisor, QA lead)",
        RESIDENT: "Runs the day-to-day of the assigned site. Creates and updates work items, logs notes, photos, videos and progress from the field, and requests changes when the site needs them. (Synonyms: Site resident, Resident engineer)",
      },
```

(Deliberately no claim about archived-access loss for SUPERVISOR/RESIDENT — that behavior ships in R1.6; update the texts then.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/dictionary-labels.test.ts tests/branding.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(i18n): health bands as construction phases; fuller role descriptions (R0.2, R0.5)"
```

---

### Task 3: Per-space upload labels

**Files:**
- Modify: `src/i18n/dictionaries.ts` (planos block, both locales)
- Modify: `src/components/bloque-spaces-panel.tsx` (t type + PlanosUpload call)
- Modify: `src/app/app/projects/[id]/page.tsx` (the two places that pass `t.planos` labels: BloqueSpacesPanel `t={...}` and PlanosTab `t={...}`)
- Test: extend `tests/dictionary-labels.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/dictionary-labels.test.ts`:

```ts
describe("per-space upload labels", () => {
  it("has an upload label for every DocumentKind in both locales", () => {
    const kinds = ["PLANO", "DOCUMENTO", "LEVANTAMIENTO", "IDEA", "MINUTA", "PLANO_ACTUALIZADO"] as const;
    for (const lang of ["es", "en"] as const) {
      for (const k of kinds) {
        expect(dictionaries[lang].planos.uploadByKind[k]).toBeTruthy();
      }
    }
    expect(dictionaries.es.planos.uploadByKind.LEVANTAMIENTO).toBe("Subir levantamiento");
  });
});
```

- [ ] **Step 2: Run it — must fail** (`uploadByKind` undefined)

Run: `npx vitest run tests/dictionary-labels.test.ts`

- [ ] **Step 3: Add the labels.** In `dictionaries.ts` ES `planos` block (after `upload`):

```ts
      uploadByKind: {
        PLANO: "Subir plano",
        PLANO_ACTUALIZADO: "Subir plano",
        DOCUMENTO: "Subir documento",
        LEVANTAMIENTO: "Subir levantamiento",
        IDEA: "Subir idea",
        MINUTA: "Subir minuta",
      },
```

EN `planos` block:

```ts
      uploadByKind: {
        PLANO: "Upload blueprint",
        PLANO_ACTUALIZADO: "Upload blueprint",
        DOCUMENTO: "Upload document",
        LEVANTAMIENTO: "Upload survey",
        IDEA: "Upload idea",
        MINUTA: "Upload minutes",
      },
```

- [ ] **Step 4: Wire it through.** In `bloque-spaces-panel.tsx`, extend the `t` prop type (it currently has `upload: string`) with `uploadByKind: Record<DocumentKind, string>` and change the PlanosUpload call (line ~82):

```tsx
{canUpload && <PlanosUpload projectId={projectId} segmentId={selected.id} kind={space.kind} t={{ upload: t.uploadByKind[space.kind] ?? t.upload, title: t.title, error: t.error }} />}
```

In `projects/[id]/page.tsx`, the BloqueSpacesPanel `t={{ … }}` gains `uploadByKind: t.planos.uploadByKind,` and the PlanosTab `t={{ … }}` changes `upload: t.planos.upload` → `upload: t.planos.uploadByKind.PLANO`.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run tests/dictionary-labels.test.ts && npm run build`
Expected: PASS, build compiles.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(spaces): upload button names its space — plano, levantamiento, idea, minuta (R0.3)"
```

---

### Task 4: Merge "Planos Actualizados" into "Planos"

**Files:**
- Modify: `src/components/bloque-spaces-panel.tsx:10,14-23`
- Modify: `src/app/app/projects/[id]/page.tsx` (selectedSpace allowlist ~line 79, `spaceKind` map, `spaceDocs` query ~line 111, planos-tab `docs` query ~line 108)

The `PLANO_ACTUALIZADO` enum value stays in the schema (history intact, `documents-action.test.ts` still covers it). Only navigation and queries merge.

- [ ] **Step 1: Remove the space.** In `bloque-spaces-panel.tsx` line 10 drop `"actualizados"` from `SpaceKey`; in `SPACES` delete the line `{ key: "actualizados", label: "Planos actualizados", kind: "PLANO_ACTUALIZADO" },`.

- [ ] **Step 2: Update the page.** In `projects/[id]/page.tsx`:
  - Remove `"actualizados"` from the `selectedSpace` allowlist array.
  - Remove `actualizados: "PLANO_ACTUALIZADO",` from the `spaceKind` map.
  - Change the `spaceDocs` query's `kind` so the merged Planos space lists both kinds:

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

  - Change the project-level planos tab `docs` query (`kind: "PLANO"`) to `kind: { in: ["PLANO", "PLANO_ACTUALIZADO"] }`.

- [ ] **Step 3: Check for stale references**

Run: `grep -rn "actualizados" src/ | grep -v "PLANO_ACTUALIZADO"`
Expected: no output (the space key is gone; only the enum value remains anywhere).

- [ ] **Step 4: Full tests + build**

Run: `npm test && npm run build`
Expected: PASS (documents-action test still green — enum untouched), build compiles.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(spaces): merge Planos Actualizados into Planos — one dated list (R0.4)"
```

---

### Task 5: Sidebar obra counts gated to ADMIN/MANAGER

**Files:**
- Modify: `src/components/app-sidebar.tsx:70-86`

`src/app/app/layout.tsx:18` already computes `isAdmin = role === "ADMIN" || role === "MANAGER"` and passes it — only the JSX needs gating. Unread stays visible to everyone.

- [ ] **Step 1: Gate the two obra stats** — replace the stats `<section>` (lines 70–86) with:

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

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles. (Client component — no node test covers it; the layout's `isAdmin` derivation is already role-correct.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(sidebar): obra totals visible to ADMIN/MANAGER only (R0.6)"
```

---

### Task 6: Cambios schema + validators (TDD)

**Files:**
- Modify: `prisma/schema.prisma` (ChangeRequest model)
- Create: migration via `prisma migrate dev`
- Modify: `src/lib/cambios/validate.ts`
- Create: `tests/cambios-validate.test.ts`

- [ ] **Step 1: Write the failing validator tests** — create `tests/cambios-validate.test.ts`:

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

- [ ] **Step 2: Run — must fail** (functions don't exist)

Run: `npx vitest run tests/cambios-validate.test.ts`
Expected: FAIL — no export named `parseReminderDueAt`.

- [ ] **Step 3: Add the validators** — append to `src/lib/cambios/validate.ts`:

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

- [ ] **Step 4: Run — must pass**

Run: `npx vitest run tests/cambios-validate.test.ts`

- [ ] **Step 5: Extend the schema.** In `prisma/schema.prisma`, ChangeRequest model, after `rejectionReason String?` add:

```prisma
  resolutionNote  String?
  reminderDueAt   DateTime?
```

(Nullable in the DB so existing rows stay valid; the action enforces presence going forward.)

- [ ] **Step 6: Migrate + regenerate**

Run: `npx prisma migrate dev --name cambios_reminder_feedback`
Expected: migration created and applied; client regenerated.

- [ ] **Step 7: Full tests**

Run: `npm test`
Expected: all pass (schema change is additive).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(cambios): reminder + resolution-note fields and validators (R0.10 part 1)"
```

---

### Task 7: createChangeRequest — mandatory reminder (TDD)

**Files:**
- Modify: `tests/cambios-action.test.ts`
- Modify: `src/app/actions/cambios.ts` (createChangeRequest)

- [ ] **Step 1: Add failing tests.** In `tests/cambios-action.test.ts`, inside the create-flow `describe`, add:

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

Then update **every existing** `createChangeRequest(fd({ … }))` call in this file (including the `openCR` helper) to include `reminderDueAt: "2027-01-15T10:00"` in the payload — they will all fail otherwise once the field is mandatory. Find them with: `grep -n "createChangeRequest(fd(" tests/cambios-action.test.ts`. Check the `fd()` helper at the top of the file: if it serializes arbitrary keys to FormData (it does for `segmentIds`), no helper change is needed.

- [ ] **Step 2: Run — new test fails** (create currently succeeds without reminder)

Run: `npx vitest run tests/cambios-action.test.ts`
Expected: `rejects creation without a reminder` FAILS (resolved instead of rejected); the rest pass.

- [ ] **Step 3: Enforce in the action.** In `src/app/actions/cambios.ts`:
  - Add to the import from `@/lib/cambios/validate`: `parseReminderDueAt` (keep existing imports).
  - After `const description = …` (line 23) add:

```ts
  const reminderDueAt = parseReminderDueAt(formData.get("reminderDueAt"));
```

  - In the `tx.changeRequest.create` data (line 41) add `reminderDueAt,` after `description,`.

- [ ] **Step 4: Run — all pass**

Run: `npx vitest run tests/cambios-action.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cambios): reminder is mandatory at creation (R0.10 part 2)"
```

---

### Task 8: resolveChangeRequest — admin resolves own + mandatory feedback + notification (TDD)

**Files:**
- Modify: `tests/cambios-action.test.ts`
- Modify: `src/app/actions/cambios.ts` (resolveChangeRequest)

- [ ] **Step 1: Add failing tests** to the resolve-flow `describe` (use the existing `openCR` helper; an `adminId` user may need creating in `beforeAll` mirroring `managerId`: `role: "ADMIN"`, email `adm-${s}@x.do`):

```ts
  it("ADMIN may resolve their own request (small-team reality) with mandatory feedback", async () => {
    const crId = await openCR(adminId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await resolveChangeRequest(fd({ changeRequestId: crId, action: "INTEGRATE", resolutionNote: "Aprobado en sitio" }));
    const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: crId } });
    expect(cr.status).toBe("INTEGRATED");
    expect(cr.resolutionNote).toBe("Aprobado en sitio");
  });

  it("MANAGER still cannot resolve their own request", async () => {
    const crId = await openCR(managerId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(
      resolveChangeRequest(fd({ changeRequestId: crId, action: "INTEGRATE", resolutionNote: "x" })),
    ).rejects.toThrow(/propia/i);
  });

  it("rejects resolution without feedback — observaciones obligatorias", async () => {
    const crId = await openCR(residentId, [segmentA]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(
      resolveChangeRequest(fd({ changeRequestId: crId, action: "INTEGRATE" })),
    ).rejects.toThrow(/feedback/i);
  });

  it("REJECT stores the note in both resolutionNote and rejectionReason and notifies with it", async () => {
    const crId = await openCR(residentId, [segmentB]);
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: crId, action: "REJECT", resolutionNote: "Falta presupuesto" }));
    const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: crId } });
    expect(cr.status).toBe("REJECTED");
    expect(cr.resolutionNote).toBe("Falta presupuesto");
    expect(cr.rejectionReason).toBe("Falta presupuesto");
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: residentId, type: "cambio.resolved", link: { contains: crId } },
    });
    expect(note.body).toContain("Falta presupuesto");
  });
```

Also update **existing** resolve tests that send `rejectionReason` to send `resolutionNote` instead (the form field is renamed): `grep -n "rejectionReason" tests/cambios-action.test.ts`.

- [ ] **Step 2: Run — new tests fail**

Run: `npx vitest run tests/cambios-action.test.ts`
Expected: the four new tests FAIL (author-exclusion throws for admin; feedback not yet required; notification body lacks note).

- [ ] **Step 3: Implement.** In `resolveChangeRequest`:
  - Replace line 81 `if (cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");` with:

```ts
  // 4-eyes when possible: a MANAGER cannot close their own solicitud. ADMIN may
  // (small companies often have a single admin who also files requests).
  if (user.role !== Role.ADMIN && cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");
```

  - Swap the import `parseRejectionReason` → `parseResolutionNote` and parse once before the branches:

```ts
  const resolutionNote = parseResolutionNote(formData.get("resolutionNote"));
```

  - REJECT branch update data becomes:

```ts
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt, rejectionReason: resolutionNote, resolutionNote } });
```

  - INTEGRATE branch `tx.changeRequest.update` data gains `resolutionNote,` after `seal`.
  - Notification (line 127) body becomes the feedback:

```ts
    body: `${cr.title} — ${resolutionNote}`,
```

  - Delete `parseRejectionReason` from `src/lib/cambios/validate.ts` **only if** `grep -rn "parseRejectionReason" src tests` shows no remaining references; otherwise leave it.

- [ ] **Step 4: Run — all pass**

Run: `npx vitest run tests/cambios-action.test.ts tests/cambios-validate.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cambios): admin may close own request; feedback mandatory and notified (R0.10 part 3)"
```

---

### Task 9: Cambios UI — reminder field + feedback forms + admin button

**Files:**
- Modify: `src/i18n/dictionaries.ts` (changes block, both locales)
- Modify: `src/components/cambios-create.tsx`
- Modify: `src/app/app/projects/[id]/cambios/[crId]/page.tsx`
- Modify: `src/app/app/projects/[id]/page.tsx` (CambiosCreate `t={{ … }}` gains `reminder`)

- [ ] **Step 1: Dictionary strings.** ES `changes` block adds (after `rejectionReason`):

```ts
      reminder: "Recordatorio (obligatorio)",
      feedback: "Feedback / Observaciones",
```

EN:

```ts
      reminder: "Reminder (required)",
      feedback: "Feedback / Notes",
```

- [ ] **Step 2: Create form.** In `cambios-create.tsx`: add `reminder: string;` to type `T`; after the `<select name="segmentIds" …>` block insert:

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

In `projects/[id]/page.tsx`, the `CambiosCreate` `t={{ … }}` gains `reminder: t.changes.reminder,`.

- [ ] **Step 3: Detail page.** In `cambios/[crId]/page.tsx`:
  - Line 34 becomes:

```ts
  const canResolve = cr.status === "OPEN" && (u.role === "ADMIN" || (u.role === "MANAGER" && cr.authorId !== u.id));
```

  - After the requester `<Field>` add the reminder display:

```tsx
        {cr.reminderDueAt && (
          <Field label={C.reminder}>{formatTimestamp(cr.reminderDueAt, lang as Lang)}</Field>
        )}
```

  - Replace the REJECTED-only reason block (lines 71–73) with a unified feedback display:

```tsx
        {cr.status !== "OPEN" && (cr.resolutionNote ?? cr.rejectionReason) && (
          <Field label={C.feedback}>{cr.resolutionNote ?? cr.rejectionReason}</Field>
        )}
```

  - INTEGRATE form gains a required feedback textarea (mirror the reject one); both forms' textareas are `name="resolutionNote"` with `placeholder={C.feedback}`:

```tsx
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
```

- [ ] **Step 4: Tests + build**

Run: `npm test && npm run build`
Expected: PASS, compiles.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cambios): reminder field, feedback forms, admin close button visible (R0.10 part 4)"
```

---

### Task 10: Notifications on permanent deletes (TDD)

**Files:**
- Create: `tests/purge-notifications.test.ts`
- Modify: `src/app/actions/admin.ts` (purgeProject) · `src/app/actions/partida-crud.ts` (purgePartida)

- [ ] **Step 1: Write the failing test** — create `tests/purge-notifications.test.ts` (mirrors the auth-mock pattern of `tests/cambios-action.test.ts`):

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
  it("purgeProject notifies managers and assigned users, not the actor", async () => {
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

  it("purgePartida notifies with the partida name", async () => {
    const project = await prisma.project.create({ data: { companyId, name: "Obra viva" } });
    const partida = await prisma.partida.create({ data: { projectId: project.id, name: "Partida fantasma", deletedAt: new Date(), deletedById: adminId } });
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });

    await purgePartida(fd({ partidaId: partida.id }));

    const mgrNote = await prisma.notification.findFirst({
      where: { userId: managerId, type: "delete.permanent", title: { contains: "Partida fantasma" } },
    });
    expect(mgrNote).not.toBeNull();
  });
});
```

Note: `purgeProject` requires `archivedAt` set and zero partidas/changes/documents — the fixture above satisfies that. If `prisma.project.delete` fails on the ProjectAssignment FK, the assignment model has `onDelete: Cascade` (verified in schema) so it will not.

- [ ] **Step 2: Run — must fail** (no notifications written yet)

Run: `npx vitest run tests/purge-notifications.test.ts`

- [ ] **Step 3: Implement in `purgeProject`** (`src/app/actions/admin.ts`). Add import `import { createNotifications } from "@/lib/notifications/create";` (check it's not already there). Before the `$transaction`, collect recipients; after it, notify:

```ts
  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: id }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: actorId }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((uid) => uid !== actorId);
```

(after the transaction:)

```ts
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Obra borrada definitivamente: ${project.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
```

- [ ] **Step 4: Implement in `purgePartida`** (`src/app/actions/partida-crud.ts`). Add the same `createNotifications` import. Before the transaction:

```ts
  const [staff, assignments, actor] = await Promise.all([
    prisma.user.findMany({ where: { companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, disabledAt: null }, select: { id: true } }),
    prisma.projectAssignment.findMany({ where: { projectId: p.projectId }, select: { userId: true } }),
    prisma.user.findFirst({ where: { id: uid }, select: { name: true } }),
  ]);
  const recipientIds = [...new Set([...staff.map((u) => u.id), ...assignments.map((a) => a.userId)])].filter((rid) => rid !== uid);
```

(after the transaction:)

```ts
  await createNotifications(recipientIds.map((userId) => ({
    companyId,
    userId,
    type: "delete.permanent",
    title: `Partida borrada definitivamente: ${p.name}`,
    body: `Borrada por ${actor?.name ?? "—"}.`,
  })));
```

- [ ] **Step 5: Run — pass; then full suite**

Run: `npx vitest run tests/purge-notifications.test.ts && npm test`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(notifications): permanent deletes notify staff and assigned users (R0.9)"
```

---

### Task 11: Surface "Borrar obra" on the project page

**Files:**
- Modify: `src/i18n/dictionaries.ts` (project block, both locales)
- Modify: `src/app/app/projects/[id]/page.tsx` (header area, ~line 222 after the title row)
- Modify: `src/app/actions/admin.ts` (purgeProject: redirect after success; archiveProject/restoreProject: also revalidate the project page)

- [ ] **Step 1: Dictionary strings.** ES `project` block adds (after `hasRecords`):

```ts
      dangerArchiveHint: "Para borrar una obra definitivamente, primero archívala. Solo se pueden borrar obras vacías (sin partidas, cambios ni documentos).",
      dangerArchivedHint: "Obra archivada. Si está vacía, puedes borrarla definitivamente.",
      restoreProject: "Restaurar obra",
```

EN:

```ts
      dangerArchiveHint: "To delete a site permanently, archive it first. Only empty sites (no work items, changes or documents) can be deleted.",
      dangerArchivedHint: "Archived site. If it is empty, you can delete it permanently.",
      restoreProject: "Restore site",
```

- [ ] **Step 2: Render the control.** In `projects/[id]/page.tsx`: add imports

```ts
import { ArchiveButton } from "@/components/archive-button";
import { PurgeProjectButton } from "@/components/purge-project-button";
import { restoreProject } from "@/app/actions/admin";
```

After the `<div className="mono text-steel" …>{project.company.name} · …</div>` line, insert:

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

(The two-step confirm inside ArchiveButton/PurgeProjectButton **is** the double confirmation the architect asked for; the server still enforces archived-first + empty-only — that is R0.8's policy: surfaced, not weakened.)

- [ ] **Step 3: Post-purge navigation.** In `purgeProject` (admin.ts): add `import { redirect } from "next/navigation";` and `redirect("/app");` as the last statement (after `revalidatePath("/app")`). In `archiveProject` and `restoreProject`, after `revalidatePath("/app");` add `revalidatePath(`/app/projects/${id}`);` so the badge and danger row refresh in place.

- [ ] **Step 4: Tests + build.** `redirect()` throws `NEXT_REDIRECT` internally — check `npm test` for any test calling `purgeProject` directly (`grep -rn "purgeProject" tests/`): the Task 10 test calls it. Update that call to swallow the redirect:

```ts
    await purgeProject(fd({ projectId: project.id })).catch((e) => {
      if (!(e instanceof Error && e.message === "NEXT_REDIRECT")) throw e;
    });
```

(If the error's message differs — Next encodes it as a digest — assert on `(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")` instead. Run the test, observe the shape, use whichever matches.)

Run: `npm test && npm run build`
Expected: PASS, compiles.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(project): surface archive/restore/borrar-obra with double confirm on the project page (R0.8)"
```

---

### Task 12: Manager-content regression tests (closes R0.7 by verification)

**Files:**
- Create: `tests/manager-content.test.ts`

Mirror the setup of `tests/documents-action.test.ts` (open it first — copy its storage handling exactly; it already proves `createDocument` works under the vitest environment) and `tests/registro-action-correction.test.ts` for `logRegistro`.

- [ ] **Step 1: Write the tests** — create `tests/manager-content.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createDocument } from "@/app/actions/documents";
import { logRegistro } from "@/app/actions/registro";

let companyId = "", managerId = "", projectId = "", partidaId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `MgrUp Co ${s}` } })).id;
  // Deliberately NOT assigned to the project — that's the regression being locked.
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
    const f = new FormData();
    f.set("projectId", projectId);
    f.set("kind", "LEVANTAMIENTO");
    f.set("title", "Levantamiento topográfico");
    f.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "lev.png", { type: "image/png" }));
    const res = await createDocument(null, f);
    expect(res).toEqual({ ok: true });
    const doc = await prisma.document.findFirstOrThrow({ where: { projectId, kind: "LEVANTAMIENTO" } });
    expect(doc.uploadedById).toBe(managerId);
  });

  it("posts a registro in the cuaderno", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const f = new FormData();
    f.set("partidaId", partidaId);
    f.set("text", "Visita de gerencia: avance correcto.");
    const res = await logRegistro(null, f);
    expect(res).toMatchObject({ ok: true });
    const reg = await prisma.registro.findFirstOrThrow({ where: { partidaId, authorId: managerId } });
    expect(reg.text).toContain("Visita de gerencia");
  });
});
```

Before running: open `tests/documents-action.test.ts` and `tests/registro-action-correction.test.ts` and align the `createDocument`/`logRegistro` invocation shapes (arg order, FormData field names, result shape) with what those tests actually do — if they differ from the above, **follow the existing tests**, not this sketch.

- [ ] **Step 2: Run**

Run: `npx vitest run tests/manager-content.test.ts`
Expected: PASS — which closes R0.7 by verification. **If either test fails**, you've found the real gap the architect hit: fix it minimally at the failing gate (`canAccessProject` / `projectAccessWhere` call sites), re-run, and note the actual root cause in the commit message.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(authz): lock manager content publishing — closes R0.7 by verification"
```

---

### Task 13: Icon sweep part 1

**Files:**
- Modify: `src/components/icons.tsx` (append 4 icons)
- Modify: `src/components/purge-project-button.tsx`, `src/components/archive-button.tsx`, `src/components/planos-upload.tsx`, `src/components/cambios-create.tsx`

- [ ] **Step 1: Add icons** — append to `icons.tsx`, matching the existing `base()` pattern exactly:

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

- [ ] **Step 2: Apply them.**
  - `purge-project-button.tsx`: `import { Trash } from "@/components/icons";` — initial button content becomes `<Trash size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{t.purge}`.
  - `archive-button.tsx`: `import { Archive } from "@/components/icons";` — initial button content becomes `<Archive size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{t.archive}`.
  - `planos-upload.tsx`: `import { Upload } from "@/components/icons";` — SubmitButton content becomes `<Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.upload}`.
  - `cambios-create.tsx`: `import { ClipboardPlus } from "@/components/icons";` — SubmitButton content becomes `<ClipboardPlus size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.new}`.

- [ ] **Step 3: Build + lint**

Run: `npm run lint && npm run build`
Expected: clean, compiles.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): representative line icons on destructive/upload/cambio actions (R0.11 part 1)"
```

---

### Task 14: Final verification + push

- [ ] **Step 1: Full gate**

Run: `npm test && npm run lint && npm run build`
Expected: every test passes (208 + the new ones), lint clean, build compiles.

- [ ] **Step 2: R0 acceptance sweep** (manual, against `npm run dev`):
- App shows "Raphel" in sidebar, landing, login, tab title.
- Dashboard health bands read Fase de Definición / Avance / Terminación.
- Levantamientos space button says "Subir levantamiento"; Ideas says "Subir idea".
- "Planos actualizados" space is gone; Planos lists docs of both kinds.
- As RESIDENT (create one via Equipo): sidebar shows no obra totals.
- New solicitud de cambio refuses to submit without reminder.
- As ADMIN on an own solicitud: Integrar/Rechazar visible; both demand feedback.
- Project page (ADMIN): archive → restore/borrar controls appear with hint.
- Purge an empty archived obra → notification appears for the MANAGER user.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-review (done at planning time)

- **Spec coverage:** R0.1→T1 · R0.2→T2 · R0.3→T3 · R0.4→T4 · R0.5→T2 · R0.6→T5 · R0.7→T12 (+T0 spec amendment) · R0.8→T11 · R0.9→T10 · R0.10→T6+T7+T8+T9 · R0.11→T13.
- **Known judgment calls baked in:** `resolutionNote` mirrors into `rejectionReason` on reject (back-compat); `raphl:` internal event names intentionally not renamed; CR reminders display on the detail page but don't join the per-bloque Recordatorios space yet (that space is registro-bound; revisit in R3's reshape).
- **Type consistency:** `parseReminderDueAt`/`parseResolutionNote` defined in T6, used in T7/T8; `uploadByKind` defined in T3 dictionary and consumed in the same task; `delete.permanent` type used in both T10 actions and its test.
