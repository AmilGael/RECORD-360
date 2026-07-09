# Raphel R1 — Data Model Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R1 of the round-2 spec: project cover photos, immutable registration codes + QR certification with a public verify page, user profile fields (phone/photo/firma), company seal, assignment counts in Equipo, and archived-obra access revocation.

**Architecture:** Additive Prisma migration (with an in-migration SQL backfill for `registrationCode`); images ride the existing `Storage` abstraction with a new branded-image helper (PNG-only subset for firma/seal); the authenticated `/api/media/[key]` route gains lookups for the four new image owners; archived-access revocation lands in the single authz choke point `projectAccessWhere`. QR codes are generated server-side (`qrcode` npm package, no native deps) encoding a public `/verify/[code]` certificate page.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (PostgreSQL), vitest (node env, real DB, `vi.mock("@/auth")` pattern), `qrcode`.

**Spec:** `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md` §R1
**Working directory:** `/Users/genel/Mirror/RECORD-360/web` (all commands run here). Branch: `feat/web-security-hardening`.

**Hard rules:** every user-facing string goes in BOTH `es` and `en` blocks of `src/i18n/dictionaries.ts`; NO emoji — icons from `src/components/icons.tsx` only; registros stay immutable; `registrationCode` has **no update path anywhere** (not in any form, not in any action).

**Spec deviation locked in (note in commit, amend spec in Task 8):** profile editing happens in Equipo by ADMIN/MANAGER only — the Equipo page is already gated to those roles, and they can set any member's phone/photo/firma. Self-service "edit my own profile" needs a new surface and is deferred (R3 or later).

---

### Task 1: `qrcode` dependency + registration-code library (TDD)

**Files:**
- Create: `src/lib/project/registration-code.ts`
- Create: `src/lib/project/qr.ts`
- Test: `tests/registration-code.test.ts`

- [ ] **Step 1: Install the QR dependency**

```bash
npm install qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: Write the failing test** — create `tests/registration-code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateRegistrationCode, isValidRegistrationCode } from "@/lib/project/registration-code";

describe("registration codes (Crockford base32, RPH-XXXX-XXXX)", () => {
  it("generates codes in the canonical format", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRegistrationCode()).toMatch(/^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });
  it("never uses ambiguous characters (I, L, O, U)", () => {
    const joined = Array.from({ length: 200 }, generateRegistrationCode).join("");
    expect(joined).not.toMatch(/[ILOU]/);
  });
  it("validates well-formed codes and rejects garbage", () => {
    expect(isValidRegistrationCode(generateRegistrationCode())).toBe(true);
    expect(isValidRegistrationCode("RPH-1234-567I")).toBe(false); // ambiguous char
    expect(isValidRegistrationCode("XXX-1234-5678")).toBe(false);
    expect(isValidRegistrationCode("RPH-1234")).toBe(false);
    expect(isValidRegistrationCode("rph-1234-5678")).toBe(false); // lowercase
  });
  it("is collision-resistant in a small sample", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateRegistrationCode));
    expect(codes.size).toBe(1000);
  });
});
```

- [ ] **Step 3: Run — must fail** (module doesn't exist)

Run: `npx vitest run tests/registration-code.test.ts`

- [ ] **Step 4: Implement** — create `src/lib/project/registration-code.ts`:

```ts
import { randomInt } from "node:crypto";

// Crockford base32 alphabet — no I, L, O, U (ambiguous when read aloud or
// transcribed from a printed report). The code certifies that a record belongs
// to an obra, so it must survive being dictated over the phone.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Immutable per-obra registration code, e.g. RPH-7K2M-94XW. */
export function generateRegistrationCode(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `RPH-${block()}-${block()}`;
}

export function isValidRegistrationCode(code: string): boolean {
  return /^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code);
}
```

And `src/lib/project/qr.ts`:

```ts
import QRCode from "qrcode";

/**
 * QR data-URL for an obra's public certificate page. Rendered on demand —
 * never stored. Encodes APP_URL/verify/{code}; falls back to a relative URL
 * in dev when APP_URL is unset.
 */
export async function registrationQrDataUrl(registrationCode: string, width = 240): Promise<string> {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return QRCode.toDataURL(`${base}/verify/${registrationCode}`, { margin: 1, width });
}
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run tests/registration-code.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(r1): registration-code generator + QR helper (R1.2 part 1)"
```

---

### Task 2: Schema migration with registrationCode backfill

**Files:**
- Modify: `prisma/schema.prisma` (Project, User, Company models)
- Create: migration `r1_identity_fields` (hand-edited SQL)
- Modify: `src/app/actions/admin.ts` (createProject)
- Test: extend `tests/registration-code.test.ts`

- [ ] **Step 1: Edit the schema.** In `prisma/schema.prisma`:

Project model — add after `description String?`:
```prisma
  coverImageKey    String?
  registrationCode String  @unique
```

User model — add after `role Role`:
```prisma
  phone        String?
  photoKey     String?
  signatureKey String?
```

Company model — add after `name String`:
```prisma
  sealKey String?
```

- [ ] **Step 2: Create the migration WITHOUT applying** (`registrationCode` is NOT NULL — existing rows need a backfill first):

Run: `npx prisma migrate dev --name r1_identity_fields --create-only`

- [ ] **Step 3: Replace the generated SQL** in `prisma/migrations/<timestamp>_r1_identity_fields/migration.sql` with:

```sql
-- New identity fields (all nullable, additive)
ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "photoKey" TEXT, ADD COLUMN "signatureKey" TEXT;
ALTER TABLE "Company" ADD COLUMN "sealKey" TEXT;
ALTER TABLE "Project" ADD COLUMN "coverImageKey" TEXT, ADD COLUMN "registrationCode" TEXT;

-- Backfill registration codes for existing obras (Crockford base32, RPH-XXXX-XXXX),
-- retrying on the (astronomically unlikely) collision.
DO $$
DECLARE
  r RECORD;
  chars TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code TEXT;
  i INT;
BEGIN
  FOR r IN SELECT id FROM "Project" WHERE "registrationCode" IS NULL LOOP
    LOOP
      code := 'RPH-';
      FOR i IN 1..4 LOOP code := code || substr(chars, floor(random()*32)::int + 1, 1); END LOOP;
      code := code || '-';
      FOR i IN 1..4 LOOP code := code || substr(chars, floor(random()*32)::int + 1, 1); END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Project" WHERE "registrationCode" = code);
    END LOOP;
    UPDATE "Project" SET "registrationCode" = code WHERE id = r.id;
  END LOOP;
END $$;

-- Now lock it down: required + unique. No update path exists in the app.
ALTER TABLE "Project" ALTER COLUMN "registrationCode" SET NOT NULL;
CREATE UNIQUE INDEX "Project_registrationCode_key" ON "Project"("registrationCode");
```

- [ ] **Step 4: Apply + regenerate**

Run: `npx prisma migrate dev`
Expected: migration applied, client regenerated, no drift.

- [ ] **Step 5: Generate codes on creation.** In `src/app/actions/admin.ts` `createProject` — add import `import { generateRegistrationCode } from "@/lib/project/registration-code";` and extend the create data:

```ts
export async function createProject(formData: FormData) {
  const { companyId } = await requireAdmin();
  await prisma.project.create({
    data: {
      companyId,
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? "") || null,
      registrationCode: generateRegistrationCode(),
    },
  });
  revalidatePath("/app");
}
```

(No collision retry: 32⁸ ≈ 1.1 trillion codes; a unique-constraint failure here is a re-submit, not a code path worth building.)

- [ ] **Step 6: Add the integration test** — append to `tests/registration-code.test.ts` (mirror the auth-mock pattern from `tests/purge-notifications.test.ts`):

```ts
import { afterAll, beforeAll, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createProject } from "@/app/actions/admin";

describe("createProject mints an immutable registration code", () => {
  let companyId = "", adminId = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Code Co ${s}` } })).id;
    adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("new obras get a canonical code", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData();
    fd.set("name", "Obra Certificada");
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra Certificada" } });
    expect(p.registrationCode).toMatch(/^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});
```

(Put the `vi.hoisted`/`vi.mock` calls at the TOP of the file, above the existing pure-function describes — mocks are file-scoped.)

- [ ] **Step 7: Full suite** (other tests create projects directly via prisma — they bypass the action, and the DB column is backfilled NOT NULL only for pre-existing rows… **no**: the column is NOT NULL for ALL rows, so every `prisma.project.create` in existing tests now fails!). **Fix the fixtures:** grep and update every direct project creation in tests to include a code:

Run: `grep -rn "prisma.project.create" tests/`
For each hit, add `registrationCode: \`RPH-TEST-${index or unique suffix}\`` style values — they must be **unique per creation**; simplest is deriving from the existing unique suffix `s` already used in names, e.g.:

```ts
import { generateRegistrationCode } from "@/lib/project/registration-code";
// ...
prisma.project.create({ data: { companyId, name: `CR Project ${s}`, registrationCode: generateRegistrationCode() } })
```

Use the real generator everywhere (it's deterministic-format, collision-safe, and keeps fixtures honest).

Run: `npm test`
Expected: all pass (231+).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(r1): identity fields migration with registrationCode backfill; codes minted at creation (R1.1-R1.4 schema)"
```

---

### Task 3: Branded-image upload helper + media-route lookups (TDD)

**Files:**
- Create: `src/lib/storage/image-upload.ts`
- Modify: `src/app/api/media/[key]/route.ts:27-41`
- Test: `tests/image-upload.test.ts`, `tests/media-route-identity.test.ts`

- [ ] **Step 1: Failing tests for the helper** — create `tests/image-upload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { uploadBrandedImage } from "@/lib/storage/image-upload";
import type { Storage } from "@/lib/storage/types";

const fakeStorage: Storage = {
  async put(file) {
    return { key: `fake-${file.contentType.split("/")[1]}.bin`, url: "/api/media/x" };
  },
  async get() {
    throw new Error("not used");
  },
};

function file(type: string, bytes = 16): File {
  return new File([new Uint8Array(bytes)], "img", { type });
}

describe("uploadBrandedImage", () => {
  it("accepts jpeg/png/webp for general images", async () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      await expect(uploadBrandedImage(file(type), fakeStorage)).resolves.toBeTruthy();
    }
  });
  it("rejects non-image and dangerous types", async () => {
    await expect(uploadBrandedImage(file("image/svg+xml"), fakeStorage)).rejects.toThrow();
    await expect(uploadBrandedImage(file("application/pdf"), fakeStorage)).rejects.toThrow();
  });
  it("pngOnly mode rejects everything but PNG (firma/seal contract)", async () => {
    await expect(uploadBrandedImage(file("image/png"), fakeStorage, { pngOnly: true })).resolves.toBeTruthy();
    await expect(uploadBrandedImage(file("image/jpeg"), fakeStorage, { pngOnly: true })).rejects.toThrow(/PNG/i);
  });
  it("rejects oversize files", async () => {
    await expect(uploadBrandedImage(file("image/png", 9 * 1024 * 1024), fakeStorage)).rejects.toThrow(/8 MB/);
  });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run tests/image-upload.test.ts`

- [ ] **Step 3: Implement** — create `src/lib/storage/image-upload.ts`:

```ts
import type { Storage } from "./types";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PNG_ONLY = ["image/png"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Upload a branded image (project cover, user photo, firma, company seal) and
 * return its storage key. Firma and seal are PNG-only (transparent/white
 * background contract from the architect); covers and photos allow jpeg/png/webp.
 * SVG stays excluded everywhere (stored-XSS vector).
 */
export async function uploadBrandedImage(
  file: File,
  storage: Storage,
  opts: { pngOnly?: boolean } = {},
): Promise<string> {
  const allowed = opts.pngOnly ? PNG_ONLY : IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    throw new Error(opts.pngOnly ? "El archivo debe ser PNG (fondo transparente o blanco)." : "Formato de imagen no válido (JPG, PNG o WebP).");
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error("La imagen supera el máximo de 8 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const { key } = await storage.put({ buffer, filename: file.name, contentType: file.type });
  return key;
}
```

- [ ] **Step 4: Run — pass.** Then the media-route test — create `tests/media-route-identity.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  storage: {
    put: vi.fn(),
    get: vi.fn(async () => Readable.from([Buffer.from([0x89, 0x50])])),
  },
}));

import { GET } from "@/app/api/media/[key]/route";

let companyId = "", otherCompanyId = "", adminId = "", outsiderId = "", residentId = "", projectId = "";
const COVER_KEY = "r1cover-test.png";
const PHOTO_KEY = "r1photo-test.png";
const SEAL_KEY = "r1seal-test.png";

function req(key: string) {
  return [new Request(`http://test/api/media/${key}`), { params: Promise.resolve({ key }) }] as const;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Media Co ${s}`, sealKey: SEAL_KEY } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x", photoKey: PHOTO_KEY } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Media Obra ${s}`, registrationCode: `RPH-MD${s.slice(0, 2).toUpperCase().replace(/[^0-9A-Z]/g, "0")}-TEST`.slice(0, 13), coverImageKey: COVER_KEY } })).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

describe("media route serves identity images with tenant scoping", () => {
  it("company member sees the project cover", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const res = await GET(...req(COVER_KEY));
    expect(res.status).toBe(200);
  });
  it("outsider company gets 404 for the cover", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: otherCompanyId, role: "ADMIN" } });
    const res = await GET(...req(COVER_KEY));
    expect(res.status).toBe(404);
  });
  it("company member sees a colleague's photo and the company seal", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    expect((await GET(...req(PHOTO_KEY))).status).toBe(200);
    expect((await GET(...req(SEAL_KEY))).status).toBe(200);
  });
  it("outsider gets 404 for photo and seal", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: otherCompanyId, role: "ADMIN" } });
    expect((await GET(...req(PHOTO_KEY))).status).toBe(404);
    expect((await GET(...req(SEAL_KEY))).status).toBe(404);
  });
});
```

NOTE: if the registrationCode literal in `beforeAll` fights the format check, just use `generateRegistrationCode()` from `@/lib/project/registration-code` instead — the simpler the better.

- [ ] **Step 5: Run — fail** (route doesn't know the new owners). Then extend the route. In `src/app/api/media/[key]/route.ts`, replace the lookup block (lines 25–41) with:

```ts
    const url = `/api/media/${safeKey}`;
    const accessWhere = projectAccessWhere(sessionUser);
    const [attachment, changeAttachment, document, coverProject, member, company] = await Promise.all([
      prisma.attachment.findFirst({
        where: { url, registro: { partida: { project: accessWhere } } },
        select: { id: true },
      }),
      prisma.changeAttachment.findFirst({
        where: { url, changeRequest: { project: accessWhere } },
        select: { id: true },
      }),
      prisma.document.findFirst({
        where: { url, project: accessWhere },
        select: { id: true },
      }),
      // Identity images (R1): covers are project-scoped; member photos/firmas and
      // the company seal are company-scoped.
      prisma.project.findFirst({ where: { coverImageKey: safeKey, ...accessWhere }, select: { id: true } }),
      prisma.user.findFirst({
        where: { companyId: sessionUser.companyId, OR: [{ photoKey: safeKey }, { signatureKey: safeKey }] },
        select: { id: true },
      }),
      prisma.company.findFirst({ where: { id: sessionUser.companyId, sealKey: safeKey }, select: { id: true } }),
    ]);
    if (!attachment && !changeAttachment && !document && !coverProject && !member && !company) {
      return new Response("Not found", { status: 404 });
    }
```

- [ ] **Step 6: Run both tests + full suite**

Run: `npx vitest run tests/image-upload.test.ts tests/media-route-identity.test.ts && npm test`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(r1): branded-image upload helper; media route serves covers, photos, firmas, seals (R1.1/R1.3/R1.4 plumbing)"
```

---

### Task 4: Project cover photo — upload + render (R1.1)

**Files:**
- Modify: `src/app/actions/admin.ts` (createProject; new `updateProjectCover`)
- Modify: `src/app/app/page.tsx` (~line 210, repo-card; ~line 302, create form)
- Modify: `src/app/app/projects/[id]/page.tsx` (header, ~line 222)
- Modify: `src/i18n/dictionaries.ts` (dash + project blocks, both locales)
- Test: extend `tests/registration-code.test.ts` describe (cover at creation)

- [ ] **Step 1: Dictionary strings.** ES `dash` block adds: `cover: "Foto de portada (opcional)",`. EN: `cover: "Cover photo (optional)",`. ES `project` block adds: `changeCover: "Cambiar portada",`. EN: `changeCover: "Change cover",`.

- [ ] **Step 2: Action changes.** In `src/app/actions/admin.ts` add imports:

```ts
import { storage } from "@/lib/storage";
import { uploadBrandedImage } from "@/lib/storage/image-upload";
```

`createProject` becomes:

```ts
export async function createProject(formData: FormData) {
  const { companyId } = await requireAdmin();
  const cover = formData.get("cover");
  const coverImageKey = cover instanceof File && cover.size > 0
    ? await uploadBrandedImage(cover, storage)
    : null;
  await prisma.project.create({
    data: {
      companyId,
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? "") || null,
      registrationCode: generateRegistrationCode(),
      coverImageKey,
    },
  });
  revalidatePath("/app");
}
```

New action (after `restoreProject`):

```ts
export async function updateProjectCover(formData: FormData) {
  const { companyId } = await requireAdmin();
  const id = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error("Forbidden");
  const cover = formData.get("cover");
  if (!(cover instanceof File) || cover.size === 0) throw new Error("Selecciona una imagen.");
  const coverImageKey = await uploadBrandedImage(cover, storage);
  await prisma.project.update({ where: { id }, data: { coverImageKey } });
  revalidatePath("/app");
  revalidatePath(`/app/projects/${id}`);
}
```

- [ ] **Step 3: Create-form input.** In `src/app/app/page.tsx`, the create panel `<form action={createProject} ...>` gains after the description form-group:

```tsx
              <div className="form-group">
                <label className="form-label" htmlFor="dash-cover">{D.cover}</label>
                <input id="dash-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="input" style={{ padding: 6 }} />
              </div>
```

- [ ] **Step 4: Dashboard card thumb.** The active-projects query must select `coverImageKey` (find the projects query feeding `projectRows` and add the field to its select if it uses one; if it returns full rows, it's already there — verify). In the repo-card (line ~213), render the thumb before the folder icon:

```tsx
                  <div className="repo-title">
                    {p.coverImageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${p.coverImageKey}`} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
                    ) : (
                      <span className="folder-icon"><Folder size={14} /></span>
                    )}
                    {p.name}
```

(Wire `coverImageKey` through the `projectRows` mapping — add `coverImageKey: p.coverImageKey,` wherever the row object is built.)

- [ ] **Step 5: Project header.** In `src/app/app/projects/[id]/page.tsx`, in the title row (`<div style={{ display: "flex", alignItems: "center", gap: 10, ...}}>` around line 222), render the cover before the `<h1>`:

```tsx
        {project.coverImageKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${project.coverImageKey}`} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
        )}
```

And in the `isOwner` danger row (Task 11 of R0 added it), add the change-cover control before the archive/purge controls:

```tsx
          <form action={updateProjectCover} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="file" name="cover" required accept="image/jpeg,image/png,image/webp" style={{ fontSize: "0.72rem", maxWidth: 180 }} />
            <SubmitButton className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.changeCover}</SubmitButton>
          </form>
```

(Import `updateProjectCover` from `@/app/actions/admin`; `SubmitButton` is already imported or import from `@/components/submit-button`.)

- [ ] **Step 6: Test.** Append to the createProject describe in `tests/registration-code.test.ts`:

```ts
  it("stores a cover image when provided", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    const fd = new FormData();
    fd.set("name", "Obra con Portada");
    fd.set("cover", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
    await createProject(fd);
    const p = await prisma.project.findFirstOrThrow({ where: { companyId, name: "Obra con Portada" } });
    expect(p.coverImageKey).toMatch(/\.png$/);
  });
```

NOTE: this hits the real `storage` (local disk in tests) — mirror how `tests/documents-action.test.ts` handles storage (it mocks `@/lib/storage`); if mocking, mock `put` to return `{ key: "cover-test.png", url: "/api/media/cover-test.png" }` and assert `coverImageKey === "cover-test.png"`.

- [ ] **Step 7: Run + build + commit**

```bash
npx vitest run tests/registration-code.test.ts && npm run build
git add -A && git commit -m "feat(r1): project cover photos — upload at creation, change in settings, card + header render (R1.1)"
```

---

### Task 5: Registration code display + QR + public verify page (R1.2)

**Files:**
- Modify: `src/app/app/projects/[id]/page.tsx` (header meta row)
- Create: `src/app/verify/[code]/page.tsx`
- Modify: `src/auth.config.ts:16` (public allowlist)
- Modify: `src/i18n/dictionaries.ts` (project + new verify block, both locales)
- Test: `tests/verify-lookup.test.ts`

- [ ] **Step 1: Dictionary.** ES `project` block adds `registrationCode: "Código de Registro",`. EN: `registrationCode: "Registration Code",`. New top-level `verify` block, ES (after `pager`):

```ts
    verify: {
      title: "Certificado de Registro",
      valid: "Registro válido",
      validSince: "Registro válido desde",
      obra: "Obra",
      company: "Compañía",
      invalid: "Código no reconocido",
      invalidBody: "Este código no corresponde a ninguna obra registrada en Raphel.",
      tagline: "Cada entrada queda sellada con hora, GPS y cadena de verificación criptográfica.",
    },
```

EN:

```ts
    verify: {
      title: "Registration Certificate",
      valid: "Valid registration",
      validSince: "Registered since",
      obra: "Site",
      company: "Company",
      invalid: "Unrecognized code",
      invalidBody: "This code does not match any site registered in Raphel.",
      tagline: "Every entry is sealed with time, GPS and a cryptographic verification chain.",
    },
```

- [ ] **Step 2: Public route.** In `src/auth.config.ts` line 16:

```ts
      const isPublic = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/verify");
```

- [ ] **Step 3: Verify page** — create `src/app/verify/[code]/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { isValidRegistrationCode } from "@/lib/project/registration-code";
import { registrationQrDataUrl } from "@/lib/project/qr";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

// PUBLIC certificate page — proves a registration code belongs to a real obra.
// Leaks nothing beyond obra name, company name and registration date.
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { lang, t } = await getDict();
  const V = t.verify;

  const project = isValidRegistrationCode(code)
    ? await prisma.project.findUnique({
        where: { registrationCode: code },
        select: { name: true, createdAt: true, company: { select: { name: true } } },
      })
    : null;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%", padding: 28, textAlign: "center" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>{V.title}</h1>
        {project ? (
          <>
            <span className="state-badge is-active" style={{ marginBottom: 14 }}>{V.valid}</span>
            <div className="mono" style={{ fontSize: "1.05rem", letterSpacing: "0.12em", margin: "10px 0 18px" }}>{code}</div>
            <div className="form-label">{V.obra}</div>
            <div style={{ fontSize: "1rem", marginBottom: 10 }}>{project.name}</div>
            <div className="form-label">{V.company}</div>
            <div style={{ fontSize: "0.95rem", marginBottom: 10 }}>{project.company.name}</div>
            <div className="form-label">{V.validSince}</div>
            <div style={{ fontSize: "0.9rem", marginBottom: 16 }}>{formatTimestamp(project.createdAt, lang as Lang)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={await registrationQrDataUrl(code, 160)} alt={code} style={{ width: 160, height: 160, margin: "0 auto" }} />
            <p className="mono text-steel" style={{ fontSize: "0.68rem", marginTop: 14 }}>{V.tagline}</p>
          </>
        ) : (
          <>
            <span className="state-badge is-archived" style={{ marginBottom: 14 }}>{V.invalid}</span>
            <p style={{ fontSize: "0.9rem" }}>{V.invalidBody}</p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Project header code + QR.** In `src/app/app/projects/[id]/page.tsx`, the company/partidas meta row (`{project.company.name} · {allPartidas.length}…`) becomes a row that also shows the code, and a small QR renders beside the title block:

```tsx
      <div className="mono text-steel" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%</span>
        <span className="sep">·</span>
        <span title={P.registrationCode}>{project.registrationCode}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={await registrationQrDataUrl(project.registrationCode, 64)} alt={project.registrationCode} style={{ width: 44, height: 44 }} />
      </div>
```

(Import `registrationQrDataUrl` from `@/lib/project/qr`.)

- [ ] **Step 5: Lookup test** — create `tests/verify-lookup.test.ts` (tests the data contract the page relies on — unique lookup + minimal select):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode, isValidRegistrationCode } from "@/lib/project/registration-code";

describe("verify-page lookup contract", () => {
  let companyId = "", code = "";
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    companyId = (await prisma.company.create({ data: { name: `Verify Co ${s}` } })).id;
    code = generateRegistrationCode();
    await prisma.project.create({ data: { companyId, name: `Obra Verificada ${s}`, registrationCode: code } });
  });
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("resolves a real code to name + company + date only", async () => {
    const p = await prisma.project.findUnique({
      where: { registrationCode: code },
      select: { name: true, createdAt: true, company: { select: { name: true } } },
    });
    expect(p?.name).toContain("Obra Verificada");
    expect(p?.company.name).toContain("Verify Co");
  });
  it("malformed codes never reach the database", () => {
    expect(isValidRegistrationCode("RPH-<script>-XXXX")).toBe(false);
    expect(isValidRegistrationCode("")).toBe(false);
  });
});
```

- [ ] **Step 6: Run + build + commit**

```bash
npx vitest run tests/verify-lookup.test.ts && npm test && npm run build
git add -A && git commit -m "feat(r1): registration code + QR on obra header; public verify certificate page (R1.2)"
```

---

### Task 6: Profile + seal actions (R1.3, R1.4 — TDD)

**Files:**
- Create: `src/app/actions/profile.ts`
- Test: `tests/profile-actions.test.ts`

- [ ] **Step 1: Failing tests** — create `tests/profile-actions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/storage", () => ({
  storage: {
    put: vi.fn(async (f: { contentType: string }) => ({ key: `prof-${f.contentType.split("/")[1]}-test.png`, url: "x" })),
    get: vi.fn(),
  },
}));

import { updateUserProfile, updateCompanySeal } from "@/app/actions/profile";

let companyId = "", otherCompanyId = "", adminId = "", managerId = "", residentId = "", outsiderId = "";

function png(name = "a.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}
function jpg() {
  return new File([new Uint8Array([0xff, 0xd8])], "a.jpg", { type: "image/jpeg" });
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Prof Co ${s}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Prof Other ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `adm-${s}@x.do`, name: "Adm", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "ADMIN", companyId: otherCompanyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

function fd(obj: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("updateUserProfile", () => {
  it("MANAGER sets phone, photo and firma for a member", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await updateUserProfile(fd({ userId: residentId, phone: "809-555-0101", photo: jpg(), signature: png("firma.png") }));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: residentId } });
    expect(u.phone).toBe("809-555-0101");
    expect(u.photoKey).toBeTruthy();
    expect(u.signatureKey).toBeTruthy();
  });
  it("rejects a non-PNG firma", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(updateUserProfile(fd({ userId: residentId, signature: jpg() }))).rejects.toThrow(/PNG/i);
  });
  it("RESIDENT cannot edit profiles", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await expect(updateUserProfile(fd({ userId: residentId, phone: "x" }))).rejects.toThrow(/Forbidden/);
  });
  it("cannot edit a user from another company", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(updateUserProfile(fd({ userId: outsiderId, phone: "x" }))).rejects.toThrow(/Forbidden/);
  });
});

describe("updateCompanySeal", () => {
  it("ADMIN uploads a PNG seal", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await updateCompanySeal(fd({ seal: png("sello.png") }));
    const c = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(c.sealKey).toBeTruthy();
  });
  it("MANAGER cannot set the seal (ADMIN-only)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await expect(updateCompanySeal(fd({ seal: png() }))).rejects.toThrow(/Forbidden/);
  });
  it("rejects a JPEG seal", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await expect(updateCompanySeal(fd({ seal: jpg() }))).rejects.toThrow(/PNG/i);
  });
});
```

- [ ] **Step 2: Run — fail.** `npx vitest run tests/profile-actions.test.ts`

- [ ] **Step 3: Implement** — create `src/app/actions/profile.ts`:

```ts
"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { storage } from "@/lib/storage";
import { uploadBrandedImage } from "@/lib/storage/image-upload";
import { writeAudit } from "@/lib/audit/log";
import { requireFreshSession } from "@/lib/auth/session";

const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];

/** Set a member's phone, photo and/or firma. ADMIN/MANAGER, same company. */
export async function updateUserProfile(formData: FormData) {
  const actor = await requireFreshSession();
  if (!ADMIN_ROLES.includes(actor.role)) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));
  const target = await prisma.user.findFirst({ where: { id: userId, companyId: actor.companyId } });
  if (!target) throw new Error("Forbidden");

  const data: { phone?: string | null; photoKey?: string; signatureKey?: string } = {};

  if (formData.has("phone")) {
    const phone = String(formData.get("phone") ?? "").trim();
    if (phone.length > 30) throw new Error("El número es demasiado largo.");
    data.phone = phone || null;
  }
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    data.photoKey = await uploadBrandedImage(photo, storage);
  }
  const signature = formData.get("signature");
  if (signature instanceof File && signature.size > 0) {
    // Firma contract: PNG with transparent/white background (architect requirement).
    data.signatureKey = await uploadBrandedImage(signature, storage, { pngOnly: true });
  }
  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data });
    await writeAudit(tx, {
      companyId: actor.companyId,
      actorId: actor.id,
      action: "user.profile_update",
      targetType: "User",
      targetId: target.id,
      summary: `Perfil actualizado: ${target.name}`,
    });
  });
  revalidatePath("/app/admin");
}

/** Upload the company seal (PNG, transparent/white). ADMIN only — it lands on legal reports. */
export async function updateCompanySeal(formData: FormData) {
  const actor = await requireFreshSession();
  if (actor.role !== Role.ADMIN) throw new Error("Forbidden");

  const seal = formData.get("seal");
  if (!(seal instanceof File) || seal.size === 0) throw new Error("Selecciona una imagen PNG.");
  const sealKey = await uploadBrandedImage(seal, storage, { pngOnly: true });

  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: actor.companyId }, data: { sealKey } });
    await writeAudit(tx, {
      companyId: actor.companyId,
      actorId: actor.id,
      action: "company.seal_update",
      targetType: "Company",
      targetId: actor.companyId,
      summary: "Sello de la compañía actualizado",
    });
  });
  revalidatePath("/app/admin");
}
```

(Check `writeAudit`'s exact signature in `src/lib/audit/log.ts` before using — mirror how `partida-crud.ts` calls it.)

- [ ] **Step 4: Run — pass; full suite**

Run: `npx vitest run tests/profile-actions.test.ts && npm test`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(r1): member profile (phone/photo/firma) and company seal actions, audited (R1.3, R1.4)"
```

---

### Task 7: Equipo UI — profiles, seal, assignment counts (R1.3, R1.4, R1.5)

**Files:**
- Modify: `src/app/app/admin/page.tsx`
- Create: `src/components/member-profile-form.tsx`
- Modify: `src/i18n/dictionaries.ts` (admin block, both locales)

- [ ] **Step 1: Dictionary.** ES `admin` block adds:

```ts
      phone: "Celular / flota",
      photo: "Foto",
      signature: "Firma (PNG, fondo transparente o blanco)",
      editProfile: "Editar perfil",
      saveProfile: "Guardar",
      sealTitle: "Sello de la compañía",
      sealHint: "PNG con fondo transparente o blanco. Aparece en los reportes e informes.",
      sealUpload: "Subir sello",
      noSeal: "Aún no hay sello.",
      assignedObras: "obras asignadas",
      signed: "Firma registrada",
```

EN:

```ts
      phone: "Mobile / radio",
      photo: "Photo",
      signature: "Signature (PNG, transparent or white background)",
      editProfile: "Edit profile",
      saveProfile: "Save",
      sealTitle: "Company seal",
      sealHint: "PNG with transparent or white background. Appears on reports.",
      sealUpload: "Upload seal",
      noSeal: "No seal yet.",
      assignedObras: "assigned sites",
      signed: "Signature on file",
```

- [ ] **Step 2: Profile form component** — create `src/components/member-profile-form.tsx`:

```tsx
import { updateUserProfile } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { Pencil } from "@/components/icons";

type T = { editProfile: string; phone: string; photo: string; signature: string; saveProfile: string };

export function MemberProfileForm({ userId, phone, t }: { userId: string; phone: string | null; t: T }) {
  return (
    <details className="inline-edit">
      <summary><Pencil size={11} /> {t.editProfile}</summary>
      <form action={updateUserProfile} style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input type="hidden" name="userId" value={userId} />
        <label className="form-label">
          {t.phone}
          <input name="phone" defaultValue={phone ?? ""} maxLength={30} className="input" style={{ marginTop: 4 }} />
        </label>
        <label className="form-label">
          {t.photo}
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }} />
        </label>
        <label className="form-label">
          {t.signature}
          <input name="signature" type="file" accept="image/png" style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }} />
        </label>
        <SubmitButton className="btn btn-ghost" style={{ justifySelf: "start" }}>{t.saveProfile}</SubmitButton>
      </form>
    </details>
  );
}
```

- [ ] **Step 3: Equipo page.** In `src/app/app/admin/page.tsx`:

(a) After the `users` query, load assignments for R1.5:

```ts
  const assignmentRows = await prisma.projectAssignment.findMany({
    where: { user: { companyId: user.companyId } },
    select: { userId: true, project: { select: { id: true, name: true, archivedAt: true } } },
  });
  const assignmentsByUser = new Map<string, { id: string; name: string; archivedAt: Date | null }[]>();
  for (const a of assignmentRows) {
    const list = assignmentsByUser.get(a.userId) ?? [];
    list.push(a.project);
    assignmentsByUser.set(a.userId, list);
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { sealKey: true } });
```

(b) The member-card (lines ~121–138): photo avatar, phone, firma badge, assignment count + drill-down, profile form. Replace the card body with:

```tsx
            <div key={u.id} className="member-card">
              {u.photoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${u.photoKey}`} alt="" className={`avatar ${avatarClass(u.role)}`} style={{ objectFit: "cover" }} />
              ) : (
                <div className={`avatar ${avatarClass(u.role)}`}>{initials(u.name)}</div>
              )}
              <div className="member-info">
                <div className="member-name">{u.name}</div>
                <div className="member-email">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                {u.signatureKey && (
                  <div className="mono text-steel" style={{ fontSize: "0.62rem" }}>{A.signed}</div>
                )}
                {(u.role === "SUPERVISOR" || u.role === "RESIDENT") && (
                  <details style={{ marginTop: 2 }}>
                    <summary className="mono text-steel" style={{ fontSize: "0.66rem", cursor: "pointer" }}>
                      {(assignmentsByUser.get(u.id) ?? []).length} {A.assignedObras}
                    </summary>
                    <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                      {(assignmentsByUser.get(u.id) ?? []).map((p) => (
                        <Link key={p.id} href={`/app/projects/${p.id}`} className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)", textDecoration: "none" }}>
                          {p.name}{p.archivedAt ? " (archivada)" : ""}
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <span className={`role-badge ${roleClass(u.role)}`}>{A.roles[u.role as RoleKey]}</span>
              <span className="member-date">
                {A.added} {formatTimestamp(u.createdAt, lang as Lang)}
              </span>
              <MemberProfileForm userId={u.id} phone={u.phone} t={{ editProfile: A.editProfile, phone: A.phone, photo: A.photo, signature: A.signature, saveProfile: A.saveProfile }} />
              {user.role === "ADMIN" && (
                <ResetPasswordButton
                  userId={u.id}
                  t={{ resetPw: A.resetPw, resetConfirm: A.resetConfirm, yes: A.yes, no: A.no }}
                />
              )}
            </div>
```

(Add imports: `Link` from `next/link`, `MemberProfileForm`, `updateCompanySeal` from `@/app/actions/profile`, `Upload` from `@/components/icons`.)

(c) Company seal section — after the grouped member list, before the invite panel (ADMIN only):

```tsx
      {user.role === "ADMIN" && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <div className="form-label" style={{ marginBottom: 6 }}>{A.sealTitle}</div>
          <p className="mono text-steel" style={{ fontSize: "0.7rem", margin: "0 0 10px" }}>{A.sealHint}</p>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {company.sealKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${company.sealKey}`} alt={A.sealTitle} style={{ width: 72, height: 72, objectFit: "contain", background: "#fff", borderRadius: "var(--radius-sm)", border: "1px solid var(--line-strong)" }} />
            ) : (
              <span className="mono text-steel" style={{ fontSize: "0.74rem" }}>{A.noSeal}</span>
            )}
            <form action={updateCompanySeal} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input type="file" name="seal" required accept="image/png" style={{ fontSize: "0.78rem" }} />
              <SubmitButton className="btn btn-ghost"><Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{A.sealUpload}</SubmitButton>
            </form>
          </div>
        </div>
      )}
```

(`SubmitButton` may already be imported on this page — verify; the avatar `img` reuses the `.avatar` class for sizing.)

- [ ] **Step 4: Build + manual check, commit**

```bash
npm run build
git add -A && git commit -m "feat(r1): Equipo shows photos, phones, firmas, company seal, and per-member obra assignments (R1.3-R1.5)"
```

---

### Task 8: Archived-obra access revocation (R1.6 — TDD) + roleDescs + spec amendment

**Files:**
- Modify: `src/lib/authz/projects.ts:16-20`
- Modify: `src/i18n/dictionaries.ts` (SUPERVISOR/RESIDENT roleDescs, both locales)
- Modify: `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md` (R1.3 note)
- Test: `tests/archived-access.test.ts`

- [ ] **Step 1: Failing test** — create `tests/archived-access.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { canAccessProject, projectAccessWhere } from "@/lib/authz/projects";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", managerId = "", residentId = "", supervisorId = "", activeId = "", archivedId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Arch Co ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  supervisorId = (await prisma.user.create({ data: { email: `sup-${s}@x.do`, name: "Sup", role: "SUPERVISOR", companyId, passwordHash: "x" } })).id;
  activeId = (await prisma.project.create({ data: { companyId, name: `Activa ${s}`, registrationCode: generateRegistrationCode() } })).id;
  archivedId = (await prisma.project.create({ data: { companyId, name: `Archivada ${s}`, registrationCode: generateRegistrationCode(), archivedAt: new Date() } })).id;
  for (const userId of [residentId, supervisorId]) {
    for (const projectId of [activeId, archivedId]) {
      await prisma.projectAssignment.create({ data: { projectId, userId, role: "RESIDENT" } });
    }
  }
});

afterAll(async () => {
  await prisma.projectAssignment.deleteMany({ where: { project: { companyId } } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("archived obras are revoked for RESIDENT/SUPERVISOR (R1.6)", () => {
  it("assigned RESIDENT keeps the active obra, loses the archived one", async () => {
    const u = { id: residentId, companyId, role: "RESIDENT" as const };
    expect(await canAccessProject(u, activeId)).toBe(true);
    expect(await canAccessProject(u, archivedId)).toBe(false);
  });
  it("assigned SUPERVISOR loses the archived obra too", async () => {
    const u = { id: supervisorId, companyId, role: "SUPERVISOR" as const };
    expect(await canAccessProject(u, archivedId)).toBe(false);
  });
  it("MANAGER retains access to archived obras", async () => {
    const u = { id: managerId, companyId, role: "MANAGER" as const };
    expect(await canAccessProject(u, archivedId)).toBe(true);
  });
  it("list queries through projectAccessWhere exclude archived for restricted roles", async () => {
    const rows = await prisma.project.findMany({ where: projectAccessWhere({ id: residentId, companyId, role: "RESIDENT" }) });
    expect(rows.map((p) => p.id)).toContain(activeId);
    expect(rows.map((p) => p.id)).not.toContain(archivedId);
  });
});
```

- [ ] **Step 2: Run — fail** (archived currently accessible). `npx vitest run tests/archived-access.test.ts`

- [ ] **Step 3: Implement** — in `src/lib/authz/projects.ts`, `projectAccessWhere` becomes:

```ts
export function projectAccessWhere(user: SessionUser): Prisma.ProjectWhereInput {
  const base = { companyId: user.companyId };
  if (hasCompanyWideAccess(user.role)) return base;
  // R1.6: archiving an obra revokes assigned RESIDENT/SUPERVISOR access —
  // only ADMIN/MANAGER can enter archived obras. Single choke point: this
  // where-clause feeds lists, detail pages, registros, media and reports.
  return { ...base, archivedAt: null, assignments: { some: { userId: user.id } } };
}
```

- [ ] **Step 4: Run — pass; FULL suite** (this touches every access path — watch for tests that assumed assigned-but-archived access):

Run: `npx vitest run tests/archived-access.test.ts && npm test`
If an existing test fails, read it: if it asserted a restricted role could access an archived obra, the assertion now flips per spec — update the test and say so in the commit message.

- [ ] **Step 5: roleDescs sentence (deferred from R0).** In `dictionaries.ts`, append to ES `admin.roleDescs.SUPERVISOR` (before the `(Sinónimos` parenthetical): `Pierde el acceso a las obras archivadas. ` — same for `RESIDENT`. EN equivalents: `Loses access to archived sites. `

- [ ] **Step 6: Spec amendment.** In the spec's R1.3 section, change "Editable in Equipo (ADMIN/MANAGER edit anyone; users edit their own)" to "Editable in Equipo by ADMIN/MANAGER (the page is already role-gated); self-service profile editing deferred to a later round."

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(authz): archiving an obra revokes RESIDENT/SUPERVISOR access (R1.6)"
```

---

### Task 9: Final gate + push

- [ ] **Step 1: Full gate**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass (~245), lint clean, build compiles (the new `/verify/[code]` route appears in the route list).

- [ ] **Step 2: Acceptance sweep** (manual, `npm run dev`):
- Create an obra with a cover → thumb on dashboard card, image in header.
- Header shows `RPH-XXXX-XXXX` + small QR; scanning/visiting the QR URL while **logged out** shows the certificate page; a garbage code shows "Código no reconocido".
- Equipo: edit a member → phone/photo/firma persist and render; firma rejects JPEG; ADMIN uploads company seal; supervisor/resident rows show "N obras asignadas" with working links.
- Archive an obra; as an assigned RESIDENT it disappears from the dashboard and its URL 404s; as ADMIN it remains reachable.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-review (done at planning time)

- **Spec coverage:** R1.1→T4 (schema in T2, serving in T3) · R1.2→T1+T2+T5 · R1.3→T2+T6+T7 (deviation documented + spec amended in T8) · R1.4→T2+T6+T7 · R1.5→T7 · R1.6→T8.
- **Key decisions baked in:** `registrationCode` NOT NULL with in-migration SQL backfill (collision-retry loop in SQL); no app-level update path for codes; models store the storage **key**, URLs derived as `/api/media/${key}`; media-route tenant scoping covers all four new image owners (cover inherits archived-revocation automatically via `projectAccessWhere`); firma/seal PNG-only at both helper and form `accept` level.
- **Type consistency:** `uploadBrandedImage(file, storage, { pngOnly })` defined T3, used T4/T6; `generateRegistrationCode`/`isValidRegistrationCode` defined T1, used T2/T3-tests/T5/T8-tests; `registrationQrDataUrl(code, width)` defined T1, used T5.
- **Known ripple:** T2 makes `registrationCode` required — every direct `prisma.project.create` in the existing test suite must add it (T2 Step 7 handles the sweep); T8 may flip existing assigned-archived assertions (Step 4 handles it).
