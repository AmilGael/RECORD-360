# Rich Logs Data-Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add categories, multiple content-sealed attachments, and reusable per-project locations to the hash-chained registro ledger — end-to-end (schema → backend → composer/record-card UI) — bumping the ledger to a versioned v2 format.

**Architecture:** Sequence the breaking shape-change to keep every task on a green build: (1) an *additive* migration that adds the new enums/models/fields and makes `type`/`mediaUrl` nullable without removing anything; (2) new pure helpers (`parseCategory`, `prepareAttachments`) test-first; (3) an atomic flip of the ledger core (canonical v2 + `verifyChain` + `append`) and the `logRegistro` action; (4) the composer/record-card UI; (5) a clean-break cleanup migration that drops `type`/`mediaUrl`/`RegistroType` and the dead `prepareMedia`, then resets+reseeds the dev DB.

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), Prisma 6 + PostgreSQL (migrations), Vitest (node env, `tests/**/*.test.ts`, `@`→`src`, `.env.local` loaded), `node:crypto`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-02-raphl-rich-logs-data-model-design.md`

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `web/prisma/schema.prisma` | Data model | Modify (T1 additive, T6 cleanup) |
| `web/package.json` | `prisma.seed` config so `migrate reset` reseeds | Modify (T1) |
| `web/src/lib/registro/validate.ts` | `parseProgressPct` (exists) + `parseCategory` | Modify (T2) |
| `web/tests/registro-category.test.ts` | `parseCategory` tests | Create (T2) |
| `web/src/lib/registro/upload.ts` | `prepareMedia` (exists) + `prepareAttachments` | Modify (T3), trim (T6) |
| `web/tests/registro-attachments.test.ts` | `prepareAttachments` tests | Create (T3) |
| `web/src/lib/registro/canonical.ts` | Canonical v2 payload string | Rewrite (T4) |
| `web/src/lib/registro/hash.ts` | `computeHash` (unchanged) + `verifyChain` v2 + `StoredRegistro` | Modify (T4) |
| `web/src/lib/registro/map.ts` | `toStored` v2 (reads attachments) | Modify (T4) |
| `web/src/lib/registro/append.ts` | `AppendInput` v2 + nested attachment create | Modify (T4) |
| `web/tests/canonical.test.ts` | Canonical v2 + sort-independence (exists, rewrite) | Modify (T4) |
| `web/tests/hash.test.ts` | `verifyChain` v2 (exists, rewrite) | Modify (T4) |
| `web/src/app/actions/registro.ts` | Action: category + location upsert + multi-file | Modify (T4) |
| `web/tests/append.test.ts` | DB integration: category + location + attachments | Modify (T4) |
| `web/src/i18n/dictionaries.ts` | Category labels, location placeholder (ES/EN) | Modify (T5) |
| `web/src/components/log-composer.tsx` | Category select, location datalist, multi-file | Modify (T5) |
| `web/src/components/record-card.tsx` | Category badge, location, attachment grid | Modify (T5) |
| `web/src/app/app/partidas/[id]/page.tsx` | Includes + pass project locations | Modify (T5) |
| `web/tests/registro-upload.test.ts` | `prepareMedia` test | Delete (T6) |

All commands run from `/Users/genel/Mirror/RECORD-360/web` unless stated. `DATABASE_URL` comes from `web/.env.local` (already configured; Prisma reads it via the `.env`→`.env.local` symlink, Vitest via `dotenv`).

---

## Task 1: Additive schema migration (no removals)

Add the new enums/models/fields and make `type`/`mediaUrl` nullable, leaving all existing code compiling and running. Not TDD (schema/config change — verified by build + a clean migration).

**Files:**
- Modify: `web/prisma/schema.prisma`
- Modify: `web/package.json`

- [ ] **Step 1: Add the new enums** after the existing `RegistroType` enum (do NOT remove `RegistroType` yet):

```prisma
enum RegistroCategory {
  MATERIALES
  PROCESOS
  EVENTUALIDADES
  OBSERVACIONES
  COSTOS
  PERSONAL
}

enum AttachmentType {
  IMAGE
  VIDEO
  PDF
  AUDIO
}
```

- [ ] **Step 2: Add the `Location` and `Attachment` models** (anywhere after `Partida`):

```prisma
model Location {
  id        String     @id @default(cuid())
  projectId String
  project   Project    @relation(fields: [projectId], references: [id])
  label     String
  registros Registro[]
  createdAt DateTime   @default(now())

  @@unique([projectId, label])
}

model Attachment {
  id         String         @id @default(cuid())
  registroId String
  registro   Registro       @relation(fields: [registroId], references: [id], onDelete: Cascade)
  url        String
  sha256     String
  fileType   AttachmentType

  @@index([registroId])
}
```

- [ ] **Step 3: Add `locations` to `Project`.** Inside `model Project`, add this line after `partidas    Partida[]`:

```prisma
  locations   Location[]
```

- [ ] **Step 4: Extend `Registro` additively.** Change the `type` line to be nullable and add the new fields. The `Registro` model becomes:

```prisma
model Registro {
  id              String            @id @default(cuid())
  partidaId       String
  partida         Partida           @relation(fields: [partidaId], references: [id])
  type            RegistroType?
  text            String?
  mediaUrl        String?
  category        RegistroCategory?
  locationId      String?
  location        Location?         @relation(fields: [locationId], references: [id])
  ledgerVersion   Int               @default(2)
  attachments     Attachment[]
  progressPct     Int?
  authorId        String
  serverCreatedAt DateTime
  gpsLat          Decimal?          @db.Decimal(9, 6)
  gpsLng          Decimal?          @db.Decimal(9, 6)
  prevHash        String
  hash            String
  correctionOfId  String?

  @@unique([partidaId, prevHash])
  @@index([partidaId, serverCreatedAt])
}
```

- [ ] **Step 5: Add a `prisma.seed` config to `package.json`** so `migrate reset` reseeds the admin user. Add this top-level key (e.g. after `"version"`):

```json
  "prisma": { "seed": "tsx prisma/seed.ts" },
```

- [ ] **Step 6: Create and apply the migration, regenerate the client**

Run: `npx prisma migrate dev --name rich_logs_additive`
Expected: a new folder under `prisma/migrations/`, migration applied, "Generated Prisma Client" printed.

- [ ] **Step 7: Verify the build is still green**

Run: `npm run build`
Expected: success — existing code is untouched and all new fields are optional.

- [ ] **Step 8: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/prisma web/package.json && git commit -m "feat(db): additive migration — categories, attachments, locations, ledgerVersion"
```

---

## Task 2: `parseCategory` validation (TDD)

**Files:**
- Test: `web/tests/registro-category.test.ts` (create)
- Modify: `web/src/lib/registro/validate.ts`

- [ ] **Step 1: Write the failing test**

Create `web/tests/registro-category.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCategory } from "@/lib/registro/validate";

describe("parseCategory", () => {
  it("returns null for empty / missing input", () => {
    expect(parseCategory(null)).toBeNull();
    expect(parseCategory("")).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });

  it("accepts every valid category", () => {
    for (const c of ["MATERIALES", "PROCESOS", "EVENTUALIDADES", "OBSERVACIONES", "COSTOS", "PERSONAL"]) {
      expect(parseCategory(c)).toBe(c);
    }
  });

  it("rejects an unknown category", () => {
    expect(() => parseCategory("BOGUS")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/registro-category.test.ts`
Expected: FAIL — `parseCategory` is not exported.

- [ ] **Step 3: Implement `parseCategory`.** Append to `web/src/lib/registro/validate.ts`:

```ts
import { RegistroCategory } from "@prisma/client";

const VALID_CATEGORIES = new Set<string>(Object.values(RegistroCategory));

/** Parse an optional category form value. Empty → null; a valid enum member →
 *  it; anything else throws so the action rejects tampered input. */
export function parseCategory(raw: unknown): RegistroCategory | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const v = String(raw);
  if (!VALID_CATEGORIES.has(v)) {
    throw new Error("Categoría inválida.");
  }
  return v as RegistroCategory;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/registro-category.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/tests/registro-category.test.ts web/src/lib/registro/validate.ts && git commit -m "feat(registro): parseCategory server-side validation"
```

---

## Task 3: `prepareAttachments` (TDD)

Add `prepareAttachments` alongside the existing `prepareMedia` (which stays until Task 6). It validates each image, computes a content SHA-256, and uploads.

**Files:**
- Test: `web/tests/registro-attachments.test.ts` (create)
- Modify: `web/src/lib/registro/upload.ts`

- [ ] **Step 1: Write the failing test**

Create `web/tests/registro-attachments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prepareAttachments } from "@/lib/registro/upload";
import type { Storage } from "@/lib/storage/types";

const okStorage: Storage = {
  put: async () => ({ key: "k.png", url: "/api/media/k.png" }),
  get: async () => {
    throw new Error("unused");
  },
};

describe("prepareAttachments", () => {
  it("returns an empty list when there are no files", async () => {
    expect(await prepareAttachments([], okStorage)).toEqual([]);
  });

  it("skips empty (0-byte) files", async () => {
    const empty = new File([], "x.png", { type: "image/png" });
    expect(await prepareAttachments([empty], okStorage)).toEqual([]);
  });

  it("uploads multiple images with a content sha256 and IMAGE type", async () => {
    const a = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const b = new File([new Uint8Array([9, 9, 9])], "b.jpg", { type: "image/jpeg" });
    const out = await prepareAttachments([a, b], okStorage);
    expect(out).toHaveLength(2);
    for (const att of out) {
      expect(att.fileType).toBe("IMAGE");
      expect(att.url).toBe("/api/media/k.png");
      expect(att.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // Different bytes → different hashes.
    expect(out[0].sha256).not.toBe(out[1].sha256);
  });

  it("rejects a disallowed type before touching storage", async () => {
    let called = false;
    const spy: Storage = {
      put: async () => {
        called = true;
        return { key: "", url: "" };
      },
      get: async () => {
        throw new Error("unused");
      },
    };
    const svg = new File([new Uint8Array([1])], "evil.svg", { type: "image/svg+xml" });
    await expect(prepareAttachments([svg], spy)).rejects.toThrow(/no permitido/i);
    expect(called).toBe(false);
  });

  it("maps a storage failure to a generic error", async () => {
    const failing: Storage = {
      put: async () => {
        throw new Error("disk full");
      },
      get: async () => {
        throw new Error("unused");
      },
    };
    const f = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
    await expect(prepareAttachments([f], failing)).rejects.toThrow(/no se pudo guardar/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/registro-attachments.test.ts`
Expected: FAIL — `prepareAttachments` is not exported.

- [ ] **Step 3: Implement `prepareAttachments`.** Append to `web/src/lib/registro/upload.ts` (keep the existing `prepareMedia` and its imports):

```ts
import { createHash } from "node:crypto";

export type PreparedAttachment = { fileType: "IMAGE"; url: string; sha256: string };

/**
 * Validate, content-hash, and store a list of uploaded images.
 * - Empty / 0-byte files are skipped.
 * - Disallowed MIME type → rejected before any bytes are stored.
 * - Storage failure → a generic error (never blamed on the file type).
 * Only IMAGE is wired this slice; large/other types come with presigned uploads.
 */
export async function prepareAttachments(files: File[], storage: Storage): Promise<PreparedAttachment[]> {
  const out: PreparedAttachment[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (!extensionForType(file.type)) {
      throw new Error("Tipo de archivo no permitido. Usa una imagen JPG, PNG, WEBP o GIF.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    let saved: { url: string; key: string };
    try {
      saved = await storage.put({ buffer, filename: file.name, contentType: file.type });
    } catch {
      throw new Error("No se pudo guardar el archivo. Inténtalo de nuevo.");
    }
    out.push({ fileType: "IMAGE", url: saved.url, sha256 });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/registro-attachments.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/tests/registro-attachments.test.ts web/src/lib/registro/upload.ts && git commit -m "feat(registro): prepareAttachments — multi-image upload with content sha256"
```

---

## Task 4: Flip the ledger core to v2 + rewire the action (TDD for pure logic)

This is the atomic shape-change: canonical v2, `verifyChain` v2, `map`, `append`, the `logRegistro` action, and the integration test all move to the new shape together. `type`/`mediaUrl` columns still exist (nullable) but are no longer written or read. Write the pure-logic tests first.

**Files:**
- Modify: `web/src/lib/registro/canonical.ts`, `hash.ts`, `map.ts`, `append.ts`
- Modify: `web/tests/canonical.test.ts`, `web/tests/hash.test.ts` (rewrite for v2)
- Modify: `web/src/app/actions/registro.ts`
- Modify: `web/tests/append.test.ts`

- [ ] **Step 1: Rewrite the canonical test (RED).** Replace the entire contents of `web/tests/canonical.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canonicalPayload, type RegistroPayload } from "@/lib/registro/canonical";

const base: RegistroPayload = {
  ledgerVersion: 2,
  category: "MATERIALES",
  text: "hola",
  progressPct: 40,
  authorId: "u1",
  locationId: "loc1",
  gpsLat: 18.4861,
  gpsLng: -69.9312,
  serverCreatedAt: new Date("2026-06-02T12:00:00.000Z"),
  attachments: [
    { fileType: "IMAGE", sha256: "bbbb" },
    { fileType: "IMAGE", sha256: "aaaa" },
  ],
};

describe("canonicalPayload v2", () => {
  it("emits keys in sorted order and formats gps to 6 dp", () => {
    const s = canonicalPayload(base);
    expect(s).toContain('"authorId":"u1"');
    expect(s).toContain('"gpsLat":"18.486100"');
    expect(s).toContain('"ledgerVersion":2');
    // Top-level keys are alphabetical: attachments comes first.
    expect(s.indexOf('"attachments"')).toBeLessThan(s.indexOf('"authorId"'));
  });

  it("is independent of attachment order (sorted by sha256)", () => {
    const reversed: RegistroPayload = {
      ...base,
      attachments: [
        { fileType: "IMAGE", sha256: "aaaa" },
        { fileType: "IMAGE", sha256: "bbbb" },
      ],
    };
    expect(canonicalPayload(base)).toBe(canonicalPayload(reversed));
  });

  it("represents nulls explicitly", () => {
    const s = canonicalPayload({ ...base, category: null, locationId: null, text: null, progressPct: null, gpsLat: null, gpsLng: null });
    expect(s).toContain('"category":null');
    expect(s).toContain('"locationId":null');
    expect(s).toContain('"gpsLat":null');
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `npx vitest run tests/canonical.test.ts`
Expected: FAIL — the v2 `RegistroPayload`/format doesn't exist yet (type errors / assertion failures).

- [ ] **Step 3: Rewrite `canonical.ts` to v2.** Replace the entire contents of `web/src/lib/registro/canonical.ts`:

```ts
// Server-only. Produces the canonical, deterministic string that feeds the
// tamper-evidence hash. Field set, key order, and per-field formatting are
// pinned so create-time and verify-time hashes match. This is ledger format v2.
import type { RegistroCategory } from "@prisma/client";

export type AttachmentDigest = { fileType: string; sha256: string };

export type RegistroPayload = {
  ledgerVersion: number;
  category: RegistroCategory | null;
  text: string | null;
  progressPct: number | null;
  authorId: string;
  locationId: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  serverCreatedAt: Date;
  attachments: AttachmentDigest[];
};

export function canonicalPayload(p: RegistroPayload): string {
  // Attachments are committed by content hash, order-independent.
  const attachments = p.attachments
    .map((a) => ({ fileType: a.fileType, sha256: a.sha256 }))
    .sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));

  const obj: Record<string, unknown> = {
    attachments,
    authorId: p.authorId,
    category: p.category,
    gpsLat: p.gpsLat === null ? null : p.gpsLat.toFixed(6),
    gpsLng: p.gpsLng === null ? null : p.gpsLng.toFixed(6),
    ledgerVersion: p.ledgerVersion,
    locationId: p.locationId,
    progressPct: p.progressPct === null ? null : Math.round(p.progressPct),
    serverCreatedAt: p.serverCreatedAt.toISOString(),
    text: p.text,
  };
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}
```

- [ ] **Step 4: Run the canonical test (GREEN)**

Run: `npx vitest run tests/canonical.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Rewrite the hash test (RED).** Replace the entire contents of `web/tests/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeHash, verifyChain, GENESIS_PREV_HASH, type StoredRegistro } from "@/lib/registro/hash";
import type { RegistroPayload } from "@/lib/registro/canonical";

function make(prevHash: string, id: string, over: Partial<RegistroPayload> = {}): StoredRegistro {
  const payload: RegistroPayload = {
    ledgerVersion: 2, category: null, text: "x", progressPct: null, authorId: "u1",
    locationId: null, gpsLat: null, gpsLng: null, serverCreatedAt: new Date("2026-06-02T12:00:00.000Z"),
    attachments: [], ...over,
  };
  return { ...payload, id, prevHash, hash: computeHash(prevHash, payload) };
}

describe("verifyChain v2", () => {
  it("accepts a valid two-record chain", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1");
    const r2 = make(r1.hash, "r2", { text: "y" });
    expect(verifyChain([r1, r2])).toEqual({ ok: true });
  });

  it("detects a tampered attachment hash", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1", { attachments: [{ fileType: "IMAGE", sha256: "aaaa" }] });
    const tampered = { ...r1, attachments: [{ fileType: "IMAGE", sha256: "ffff" }] };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "r1" });
  });

  it("detects a tampered category", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1", { category: "MATERIALES" });
    const tampered = { ...r1, category: "COSTOS" as const };
    expect(verifyChain([tampered])).toEqual({ ok: false, brokenAt: "r1" });
  });

  it("rejects a record stamped with a non-v2 ledgerVersion", () => {
    const r1 = make(GENESIS_PREV_HASH, "r1");
    expect(verifyChain([{ ...r1, ledgerVersion: 1 }])).toEqual({ ok: false, brokenAt: "r1" });
  });
});
```

- [ ] **Step 6: Run it (RED)**

Run: `npx vitest run tests/hash.test.ts`
Expected: FAIL — `StoredRegistro`/`verifyChain` still use the v1 shape.

- [ ] **Step 7: Update `hash.ts` `verifyChain` + `StoredRegistro` to v2.** In `web/src/lib/registro/hash.ts`, leave `computeHash` and `GENESIS_PREV_HASH` as-is and replace the `StoredRegistro` type and `verifyChain` function with:

```ts
export type StoredRegistro = RegistroPayload & {
  id: string;
  prevHash: string;
  hash: string;
};

export function verifyChain(registros: StoredRegistro[]): { ok: boolean; brokenAt?: string } {
  let expectedPrev = GENESIS_PREV_HASH;
  for (const r of registros) {
    if (r.ledgerVersion !== 2) return { ok: false, brokenAt: r.id };
    if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: r.id };
    const recomputed = computeHash(r.prevHash, {
      ledgerVersion: r.ledgerVersion, category: r.category, text: r.text, progressPct: r.progressPct,
      authorId: r.authorId, locationId: r.locationId, gpsLat: r.gpsLat, gpsLng: r.gpsLng,
      serverCreatedAt: r.serverCreatedAt, attachments: r.attachments,
    });
    if (recomputed !== r.hash) return { ok: false, brokenAt: r.id };
    expectedPrev = r.hash;
  }
  return { ok: true };
}
```

- [ ] **Step 8: Run the hash test (GREEN)**

Run: `npx vitest run tests/hash.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 9: Update `map.ts` to v2.** Replace the entire contents of `web/src/lib/registro/map.ts`:

```ts
import type { Registro, Attachment } from "@prisma/client";
import type { StoredRegistro } from "./hash";

export function toStored(r: Registro & { attachments: Attachment[] }): StoredRegistro {
  return {
    id: r.id, prevHash: r.prevHash, hash: r.hash,
    ledgerVersion: r.ledgerVersion,
    category: r.category,
    text: r.text,
    progressPct: r.progressPct,
    authorId: r.authorId,
    locationId: r.locationId,
    gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
    gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
    serverCreatedAt: r.serverCreatedAt,
    attachments: r.attachments.map((a) => ({ fileType: a.fileType, sha256: a.sha256 })),
  };
}
```

- [ ] **Step 10: Update `append.ts` to v2.** Replace the entire contents of `web/src/lib/registro/append.ts`:

```ts
import { prisma } from "@/lib/db";
import { computeHash, GENESIS_PREV_HASH } from "./hash";
import { retryOnConflict } from "./retry";
import type { RegistroCategory, AttachmentType } from "@prisma/client";

const LEDGER_VERSION = 2;

export type AppendInput = {
  partidaId: string;
  authorId: string;
  category: RegistroCategory | null;
  text: string | null;
  progressPct: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  locationId: string | null;
  attachments: { fileType: AttachmentType; url: string; sha256: string }[];
  correctionOfId?: string | null;
};

export async function appendRegistro(input: AppendInput) {
  return retryOnConflict(() =>
    prisma.$transaction(async (tx) => {
      const tip = await tx.registro.findFirst({
        where: { partidaId: input.partidaId },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      });
      const prevHash = tip ? tip.hash : GENESIS_PREV_HASH;
      const serverCreatedAt = new Date();
      const hash = computeHash(prevHash, {
        ledgerVersion: LEDGER_VERSION, category: input.category, text: input.text,
        progressPct: input.progressPct, authorId: input.authorId, locationId: input.locationId,
        gpsLat: input.gpsLat, gpsLng: input.gpsLng, serverCreatedAt,
        attachments: input.attachments.map((a) => ({ fileType: a.fileType, sha256: a.sha256 })),
      });
      const created = await tx.registro.create({
        data: {
          partidaId: input.partidaId, authorId: input.authorId, category: input.category,
          text: input.text, progressPct: input.progressPct,
          gpsLat: input.gpsLat, gpsLng: input.gpsLng, locationId: input.locationId,
          ledgerVersion: LEDGER_VERSION, serverCreatedAt, prevHash, hash,
          correctionOfId: input.correctionOfId ?? null,
          attachments: {
            create: input.attachments.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })),
          },
        },
        include: { attachments: true },
      });
      if (input.progressPct !== null) {
        await tx.partida.update({ where: { id: input.partidaId }, data: { progressPct: input.progressPct } });
      }
      return created;
    }),
  );
}
```

- [ ] **Step 11: Update the `logRegistro` action.** Replace the entire contents of `web/src/app/actions/registro.ts`:

```ts
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseProgressPct, parseCategory } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export async function logRegistro(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) throw new Error("Unauthorized");
  const authorId = user.id;

  const partidaId = String(formData.get("partidaId"));
  // Cross-tenant guard: the partida must belong to the caller's company.
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, project: { companyId: user.companyId } },
  });
  if (!partida) throw new Error("Forbidden");

  const text = (String(formData.get("text") ?? "").trim()) || null;
  const progressPct = parseProgressPct(formData.get("progressPct"));
  const category = parseCategory(formData.get("category"));
  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
  const attachments = await prepareAttachments(photos, storage);

  // Pick-or-create the location, scoped to the project; empty label → no location.
  const locationLabel = (String(formData.get("location") ?? "").trim()) || null;
  let locationId: string | null = null;
  if (locationLabel) {
    const loc = await prisma.location.upsert({
      where: { projectId_label: { projectId: partida.projectId, label: locationLabel } },
      create: { projectId: partida.projectId, label: locationLabel },
      update: {},
    });
    locationId = loc.id;
  }

  await appendRegistro({ partidaId, authorId, category, text, progressPct, gpsLat, gpsLng, locationId, attachments });
  revalidatePath(`/app/partidas/${partidaId}`);
}
```

- [ ] **Step 12: Rewrite the integration test to v2 (RED → GREEN against the DB).** Replace the entire contents of `web/tests/append.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { toStored } from "@/lib/registro/map";
import { verifyChain, GENESIS_PREV_HASH } from "@/lib/registro/hash";

let companyId = "", projectId = "", partidaId = "", userId = "", locationId = "";

beforeAll(async () => {
  const c = await prisma.company.create({ data: { name: "T Co" } });
  companyId = c.id;
  const u = await prisma.user.create({ data: { email: `t${Date.now()}@x.do`, name: "T", role: "RESIDENT", companyId, passwordHash: "x" } });
  userId = u.id;
  const p = await prisma.project.create({ data: { companyId, name: "T Proj" } });
  projectId = p.id;
  const pa = await prisma.partida.create({ data: { projectId, name: "T Partida" } });
  partidaId = pa.id;
  const loc = await prisma.location.create({ data: { projectId, label: "Piso 3 - Apto 302" } });
  locationId = loc.id;
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partidaId } }); // cascades attachments
  await prisma.location.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("appendRegistro v2", () => {
  it("links the chain, stores category/location/attachments, and verifies", async () => {
    const r1 = await appendRegistro({
      partidaId, authorId: userId, category: "MATERIALES", text: "uno", progressPct: 40,
      gpsLat: 18.4861, gpsLng: -69.9312, locationId,
      attachments: [
        { fileType: "IMAGE", url: "/api/media/a.png", sha256: "a".repeat(64) },
        { fileType: "IMAGE", url: "/api/media/b.png", sha256: "b".repeat(64) },
      ],
    });
    expect(r1.prevHash).toBe(GENESIS_PREV_HASH);
    expect(r1.attachments).toHaveLength(2);

    const r2 = await appendRegistro({
      partidaId, authorId: userId, category: null, text: "dos", progressPct: 72,
      gpsLat: null, gpsLng: null, locationId: null, attachments: [],
    });
    expect(r2.prevHash).toBe(r1.hash);

    const rows = await prisma.registro.findMany({
      where: { partidaId }, include: { attachments: true },
      orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
    });
    expect(verifyChain(rows.map(toStored))).toEqual({ ok: true });

    const partida = await prisma.partida.findUniqueOrThrow({ where: { id: partidaId } });
    expect(partida.progressPct).toBe(72);
  });
});
```

- [ ] **Step 13: Run the full suite (the build must compile, all suites green)**

Run: `npx tsc --noEmit && npm run test`
Expected: `tsc` clean; all suites pass (the `registro-upload.test.ts` for `prepareMedia` still passes — `prepareMedia` is untouched).

- [ ] **Step 14: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 15: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/lib/registro web/src/app/actions/registro.ts web/tests/canonical.test.ts web/tests/hash.test.ts web/tests/append.test.ts && git commit -m "feat(ledger): v2 format — category, location, content-sealed attachments"
```

---

## Task 5: Composer + record-card UI, and i18n

`Registro` still has nullable `type`/`mediaUrl` at this point; the record card simply stops referencing them and renders the new fields instead.

**Files:**
- Modify: `web/src/i18n/dictionaries.ts`
- Modify: `web/src/components/log-composer.tsx`
- Modify: `web/src/components/record-card.tsx`
- Modify: `web/src/app/app/partidas/[id]/page.tsx`

- [ ] **Step 1: Add i18n keys.** In `web/src/i18n/dictionaries.ts`, in the **`es`** `composer` block, add these keys (after `error:`):

```ts
      category: "Categoría",
      noCategory: "Sin categoría",
      location: "Ubicación (p. ej. Piso 3 - Apto 302)",
      categories: {
        MATERIALES: "Materiales", PROCESOS: "Procesos", EVENTUALIDADES: "Eventualidades",
        OBSERVACIONES: "Observaciones", COSTOS: "Costos", PERSONAL: "Personal",
      },
```

In the **`en`** `composer` block add:

```ts
      category: "Category",
      noCategory: "No category",
      location: "Location (e.g. Floor 3 - Apt 302)",
      categories: {
        MATERIALES: "Materials", PROCESOS: "Processes", EVENTUALIDADES: "Incidents",
        OBSERVACIONES: "Observations", COSTOS: "Costs", PERSONAL: "Labor",
      },
```

- [ ] **Step 2: Update the composer.** Replace the entire contents of `web/src/components/log-composer.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { logRegistro } from "@/app/actions/registro";
import { SubmitButton } from "@/components/submit-button";

type ComposerT = {
  placeholder: string;
  progress: string;
  gps: string;
  gpsOk: string;
  gpsLoading: string;
  submit: string;
  sending: string;
  error: string;
  category: string;
  noCategory: string;
  location: string;
  categories: Record<string, string>;
};

export function LogComposer({ partidaId, t, locations }: { partidaId: string; t: ComposerT; locations: string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsPending, setGpsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function captureGps() {
    if (!navigator.geolocation) return;
    setGpsPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsPending(false);
      },
      () => {
        setCoords(null);
        setGpsPending(false);
      },
    );
  }

  const gpsLabel = gpsPending ? t.gpsLoading : coords ? t.gpsOk : t.gps;

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setError(null);
        try {
          await logRegistro(fd);
          formRef.current?.reset();
          setCoords(null);
        } catch {
          setError(t.error);
        }
      }}
      className="card"
      style={{ padding: 16, marginBottom: 28 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <textarea name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      {error && (
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select name="category" className="input" defaultValue="" style={{ width: "auto" }} aria-label={t.category}>
          <option value="">{t.noCategory}</option>
          {Object.entries(t.categories).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input name="location" list="loc-options" placeholder={t.location} className="input" style={{ maxWidth: 240 }} />
        <datalist id="loc-options">
          {locations.map((l) => <option key={l} value={l} />)}
        </datalist>
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ fontSize: "0.8rem", maxWidth: 200 }} />
        <input type="number" name="progressPct" min={0} max={100} placeholder={t.progress} className="input" style={{ width: 118 }} />
        <button type="button" onClick={captureGps} disabled={gpsPending} className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>
          {gpsLabel}
        </button>
        <SubmitButton className="btn btn-ink" style={{ marginLeft: "auto" }} pendingLabel={t.sending}>
          {t.submit} <span className="arrow">→</span>
        </SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Update the record card.** Replace the entire contents of `web/src/components/record-card.tsx`:

```tsx
import type { Registro, Attachment, Location } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

type RecordT = { noGps: string; immutable: string };
type RegistroWithRelations = Registro & { attachments: Attachment[]; location: Location | null };

export function RecordCard({ r, t, lang }: { r: RegistroWithRelations; t: RecordT; lang: Lang }) {
  const ts = formatTimestamp(r.serverCreatedAt, lang);
  const gps =
    r.gpsLat !== null && r.gpsLng !== null
      ? `${Number(r.gpsLat).toFixed(4)} · ${Number(r.gpsLng).toFixed(4)}`
      : t.noGps;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>{r.category ?? "REGISTRO"}</span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{ts}</span>
      </div>
      <div style={{ padding: 14 }}>
        {r.location && (
          <div className="mono text-steel" style={{ fontSize: 11, marginBottom: 8 }}>📍 {r.location.label}</div>
        )}
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.attachments.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginTop: 4 }}>
            {r.attachments.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} src={a.url} alt="" style={{ width: "100%", borderRadius: "var(--radius-sm)", display: "block" }} />
            ))}
          </div>
        )}
        <div className="mono text-steel" style={{ fontSize: 11, marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · ✓ {t.immutable}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the partida page.** Replace the `partida` query and the JSX that renders the composer + records in `web/src/app/app/partidas/[id]/page.tsx`. Change the query block:

```tsx
  // Tenant scoping: only return the partida if its project belongs to the caller's company.
  const partida = await prisma.partida.findFirstOrThrow({
    where: { id, project: { companyId } },
    include: {
      project: { include: { locations: { orderBy: { label: "asc" } } } },
      registros: {
        include: { attachments: true, location: true },
        orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      },
    },
  });
  const locationLabels = partida.project.locations.map((l) => l.label);
```

And change the composer line to pass locations:

```tsx
      <LogComposer partidaId={partida.id} t={t.composer} locations={locationLabels} />
```

(The existing `<RecordCard key={r.id} r={r} t={t.record} lang={lang} />` line is unchanged — `r` now carries `attachments` + `location` via the include.)

- [ ] **Step 5: Verify build + lint + tests**

Run: `npm run lint && npm run build && npm run test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/src/i18n/dictionaries.ts web/src/components/log-composer.tsx web/src/components/record-card.tsx "web/src/app/app/partidas/[id]/page.tsx" && git commit -m "feat(ui): composer category/location/multi-image + record-card attachment grid"
```

---

## Task 6: Clean-break cleanup migration

Now that nothing reads or writes `type`/`mediaUrl`, drop them and the dead `prepareMedia`. Reset the dev DB so every row is v2.

**Files:**
- Modify: `web/prisma/schema.prisma`
- Modify: `web/src/lib/registro/upload.ts`
- Delete: `web/tests/registro-upload.test.ts`

- [ ] **Step 1: Remove the legacy fields and enum from `schema.prisma`.** In `model Registro`, delete the `type RegistroType?` line and the `mediaUrl String?` line. Then delete the entire `enum RegistroType { NOTE PHOTO }` block.

- [ ] **Step 2: Remove the dead `prepareMedia`.** In `web/src/lib/registro/upload.ts`, delete the `prepareMedia` function and its `PreparedMedia` type and the now-unused `RegistroType` import. Keep `prepareAttachments`, the `extensionForType`/`Storage`/`createHash` imports, and `PreparedAttachment`.

- [ ] **Step 3: Delete the obsolete test**

Run: `rm web/tests/registro-upload.test.ts`

- [ ] **Step 4: Confirm nothing still references the removed symbols**

Run: `cd /Users/genel/Mirror/RECORD-360/web && grep -rnE "RegistroType|prepareMedia|mediaUrl|\br\.type\b" src tests`
Expected: no output.

- [ ] **Step 5: Create the migration and reset the dev DB**

Run: `npx prisma migrate dev --name drop_registro_type_media`
Then: `npx prisma migrate reset --force`
Expected: migration created/applied; reset drops the DB, re-applies all migrations, and runs the seed (admin@record360.do). No registro rows remain, so every future entry is v2.

- [ ] **Step 6: Verify everything green**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test`
Expected: all green (8 test files now — `registro-upload.test.ts` removed, `registro-category` + `registro-attachments` added).

- [ ] **Step 7: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360 && git add web/prisma web/src/lib/registro/upload.ts web/tests && git commit -m "refactor(db): drop legacy type/mediaUrl + RegistroType; remove prepareMedia"
```

---

## Task 7: Full verification + manual pass

**Files:** none.

- [ ] **Step 1: Full automated gate**

Run: `cd /Users/genel/Mirror/RECORD-360/web && npm run test && npm run lint && npm run build`
Expected: all suites pass, lint clean, build succeeds.

- [ ] **Step 2: Manual pass (dev server)**

Run: `npm run dev`, sign in (`admin@record360.do` / `demo1234`), create a project + partida, then in the composer: pick a **category**, type a **location** (e.g. "Piso 3 - Apto 302"), attach **2+ images**, set progress, capture GPS, submit. Confirm the record card shows the category badge, the location line, and an **image grid** of all attachments; the timestamp is localized. Reload and open the composer again — the location should appear in the **datalist** for reuse. Toggle **ES ⇄ EN** and confirm category labels + placeholders translate.

- [ ] **Step 3: Done** — no commit (verification only). If a regression appears, fix it in the relevant file and re-run Step 1.

---

## Self-Review

**Spec coverage:**
- `RegistroCategory` enum + optional category → T1 (schema), T2 (`parseCategory`), T4 (canonical/append/action), T5 (UI). ✓
- `Attachment` model + multi-image, content SHA-256 sealed → T1 (schema), T3 (`prepareAttachments`), T4 (canonical digest + nested create + integration), T5 (grid). ✓
- `Location` model, pick-or-create, optional `locationId` → T1 (schema), T4 (action upsert + hash commits `locationId`), T5 (datalist). ✓
- `ledgerVersion` stamp + v2 canonical, `verifyChain` asserts v2 → T1 (field), T4 (canonical/hash/append). ✓
- Migration as additive→clean-break with dev reset/reseed → T1 (additive + seed config), T6 (drop + reset). ✓
- UI end-to-end (composer, record-card, partida, i18n) → T5. ✓
- Deferred items (VIDEO/PDF/AUDIO, presigned uploads, PR/SpatialPin, roles, concurrency stress) → not in any task. ✓
- Testing per spec (canonical v2, verifyChain v2, parseCategory, prepareAttachments, DB integration) → T2, T3, T4. ✓

**Placeholder scan:** every code step shows full before/after or full-file content; no TBD/TODO/"add validation". ✓

**Type consistency:** `RegistroPayload` (v2) fields match across `canonical.ts`, `hash.ts` `verifyChain`, `map.ts` `toStored`, and `append.ts` `computeHash` call (`ledgerVersion`, `category`, `text`, `progressPct`, `authorId`, `locationId`, `gpsLat`, `gpsLng`, `serverCreatedAt`, `attachments:{fileType,sha256}`). `AppendInput.attachments` uses `{fileType,url,sha256}`; `prepareAttachments` returns the same shape; `ComposerT` keys (`category`, `noCategory`, `location`, `categories`) match the i18n additions and the composer usage. The Prisma `upsert` compound-unique selector `projectId_label` matches `@@unique([projectId, label])`. ✓
