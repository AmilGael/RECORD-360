# Phase 0 — Hotfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock field testing by fixing multimodal uploads, automatic GPS capture, error handling that wipes the form, missing note author names, and the Bitácora→Cuaderno rename.

**Architecture:** Expand the storage MIME allowlist to images/PDF/video/audio and derive `AttachmentType` from MIME; raise the Next server-action body limit; render attachments by type; resolve note author names; convert the note composer to `useActionState` (structured results, no wipe) with automatic geolocation.

**Tech Stack:** Next.js 15 (App Router, server actions, RSC), React 19 (`useActionState`), Prisma 6 + Postgres (Neon), Vitest, TypeScript.

Source spec: `docs/superpowers/specs/2026-06-05-raphl-architect-feedback-analysis.md` (§2, §9.1, §9.2, §3). Run all commands from `web/`.

---

## File Structure

- `web/src/lib/storage/mime.ts` — expand allowlist; add `attachmentKindForType`. (Task 2)
- `web/src/lib/registro/upload.ts` — multimodal `prepareAttachments`, derive fileType, per-type size caps. (Task 3)
- `web/next.config.ts` — raise `serverActions.bodySizeLimit`. (Task 4)
- `web/src/i18n/dictionaries.ts` — Bitácora→Cuaderno; add `record.by` / `record.document`. (Task 1)
- `web/src/components/record-card.tsx` — render attachments by type; show author. (Task 5)
- `web/src/app/app/partidas/[id]/page.tsx` — resolve + pass author names. (Task 6)
- `web/src/app/actions/registro.ts` — `logRegistro` returns a structured result. (Task 7)
- `web/tests/registro-action-correction.test.ts` — update to new signature. (Task 7)
- `web/src/components/log-composer.tsx` — `useActionState` + auto-GPS + wider file accept. (Task 8)
- Tests: `web/tests/mime-multimodal.test.ts`, `web/tests/upload-multimodal.test.ts`. (Tasks 2, 3)

---

### Task 1: i18n — Cuaderno rename + author/document labels

**Files:**
- Modify: `web/src/i18n/dictionaries.ts`

- [ ] **Step 1: Rename the openLog strings.** In the ES block change `openLog: "Abrir bitácora completa",` → `openLog: "Abrir Cuaderno completo",`. In the EN block change `openLog: "Open full log",` → `openLog: "Open full notebook",`.

- [ ] **Step 2: Add author + document labels to both `record` objects.** Change the ES line `record: { noGps: "sin GPS", immutable: "inalterable" },` to:

```typescript
    record: { noGps: "sin GPS", immutable: "inalterable", by: "por", document: "Ver documento" },
```

Change the EN line `record: { noGps: "no GPS", immutable: "immutable" },` to:

```typescript
    record: { noGps: "no GPS", immutable: "immutable", by: "by", document: "View document" },
```

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` — Expected: exit 0 (ES/EN shapes still match).

- [ ] **Step 4: Commit**

```bash
git add web/src/i18n/dictionaries.ts
git commit -m "i18n: Bitácora→Cuaderno; add note author + document labels"
```

---

### Task 2: Multimodal MIME allowlist

**Files:**
- Modify: `web/src/lib/storage/mime.ts`
- Test: `web/tests/mime-multimodal.test.ts`

- [ ] **Step 1: Write the failing test** (`web/tests/mime-multimodal.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { extensionForType, attachmentKindForType, contentTypeForKey } from "@/lib/storage/mime";

describe("multimodal mime allowlist", () => {
  it("maps images to IMAGE", () => {
    expect(attachmentKindForType("image/png")).toBe("IMAGE");
    expect(extensionForType("image/png")).toBe(".png");
  });
  it("maps pdf / video / audio to their kinds", () => {
    expect(attachmentKindForType("application/pdf")).toBe("PDF");
    expect(attachmentKindForType("video/mp4")).toBe("VIDEO");
    expect(attachmentKindForType("audio/mpeg")).toBe("AUDIO");
    expect(extensionForType("video/mp4")).toBe(".mp4");
  });
  it("rejects disallowed types (incl. svg)", () => {
    expect(attachmentKindForType("image/svg+xml")).toBeUndefined();
    expect(extensionForType("text/html")).toBeUndefined();
  });
  it("resolves content-type from a stored key extension", () => {
    expect(contentTypeForKey("abc.pdf")).toBe("application/pdf");
    expect(contentTypeForKey("abc.mp4")).toBe("video/mp4");
    expect(contentTypeForKey("abc.png")).toBe("image/png");
  });
});
```

- [ ] **Step 2: Run it (fails)** — Run: `npm test -- mime-multimodal` — Expected: FAIL (`attachmentKindForType` not exported).

- [ ] **Step 3: Replace `web/src/lib/storage/mime.ts` with:**

```typescript
import path from "node:path";
import type { AttachmentType } from "@prisma/client";

// Allowlist of safe, inline-servable upload types. SVG is intentionally excluded
// (can carry executable script — stored-XSS vector). The stored extension and the
// served Content-Type are both derived from this allowlist — never from the
// user-supplied filename.
const ALLOWED: Record<string, { ext: string; kind: AttachmentType }> = {
  "image/jpeg": { ext: ".jpg", kind: "IMAGE" },
  "image/png": { ext: ".png", kind: "IMAGE" },
  "image/webp": { ext: ".webp", kind: "IMAGE" },
  "image/gif": { ext: ".gif", kind: "IMAGE" },
  "application/pdf": { ext: ".pdf", kind: "PDF" },
  "video/mp4": { ext: ".mp4", kind: "VIDEO" },
  "video/quicktime": { ext: ".mov", kind: "VIDEO" },
  "audio/mpeg": { ext: ".mp3", kind: "AUDIO" },
  "audio/mp4": { ext: ".m4a", kind: "AUDIO" },
  "audio/webm": { ext: ".weba", kind: "AUDIO" },
};

const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED).map(([type, { ext }]) => [ext, type]),
);

/** Extension for an allowed upload MIME type, or undefined if not allowed. */
export function extensionForType(contentType: string): string | undefined {
  return ALLOWED[contentType]?.ext;
}

/** AttachmentType (IMAGE/VIDEO/PDF/AUDIO) for an allowed MIME type, or undefined. */
export function attachmentKindForType(contentType: string): AttachmentType | undefined {
  return ALLOWED[contentType]?.kind;
}

/** Content-Type for a stored key, derived from its extension, or undefined. */
export function contentTypeForKey(key: string): string | undefined {
  const ext = path.extname(path.basename(key)).toLowerCase();
  return EXT_TO_TYPE[ext];
}
```

- [ ] **Step 4: Run it (passes)** — Run: `npm test -- mime-multimodal` — Expected: PASS (4 tests). Then `npx tsc --noEmit` — Expected: exit 0 (confirms `local.ts`, `upload.ts`, the media route still typecheck against the kept `extensionForType`/`contentTypeForKey` signatures).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/storage/mime.ts web/tests/mime-multimodal.test.ts
git commit -m "feat(storage): multimodal MIME allowlist (image/pdf/video/audio)"
```

---

### Task 3: Multimodal prepareAttachments

**Files:**
- Modify: `web/src/lib/registro/upload.ts`
- Test: `web/tests/upload-multimodal.test.ts`

- [ ] **Step 1: Write the failing test** (`web/tests/upload-multimodal.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { prepareAttachments } from "@/lib/registro/upload";
import type { Storage } from "@/lib/storage/types";

const fakeStorage: Storage = {
  async put({ filename }) { return { key: `k-${filename}`, url: `/api/media/k-${filename}` }; },
  async get() { throw new Error("not used"); },
};

function file(name: string, type: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("prepareAttachments (multimodal)", () => {
  it("derives fileType from MIME for image, pdf, video, audio", async () => {
    const out = await prepareAttachments(
      [file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.mp4", "video/mp4"), file("d.mp3", "audio/mpeg")],
      fakeStorage,
    );
    expect(out.map((a) => a.fileType)).toEqual(["IMAGE", "PDF", "VIDEO", "AUDIO"]);
    expect(out[0].url).toBe("/api/media/k-a.png");
    expect(out[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("skips empty files and rejects disallowed types", async () => {
    expect(await prepareAttachments([file("e.txt", "text/plain")], fakeStorage)).toEqual([]).catch?.(() => {});
  });
});
```

> Note: the second assertion above is wrong on purpose to keep step 1 honest — replace it before step 4 with the real expectation in step 3's behavior: a disallowed type THROWS. Use:
> ```typescript
>   it("rejects disallowed types", async () => {
>     await expect(prepareAttachments([file("e.txt", "text/plain")], fakeStorage)).rejects.toThrow();
>   });
>   it("skips empty (0-byte) files", async () => {
>     expect(await prepareAttachments([file("z.png", "image/png", 0)], fakeStorage)).toEqual([]);
>   });
> ```
> (Delete the malformed `it("skips empty files and rejects…")` case; use these two instead.)

- [ ] **Step 2: Run it (fails)** — Run: `npm test -- upload-multimodal` — Expected: FAIL (current `prepareAttachments` hard-codes `fileType: "IMAGE"` and rejects pdf/video/audio).

- [ ] **Step 3: Replace `web/src/lib/registro/upload.ts` with:**

```typescript
import type { Storage } from "@/lib/storage/types";
import { attachmentKindForType } from "@/lib/storage/mime";
import type { AttachmentType } from "@prisma/client";
import { createHash } from "node:crypto";

export type PreparedAttachment = { fileType: AttachmentType; url: string; sha256: string };

const MAX_FILES = 10;
const SIZE_CAP: Record<AttachmentType, number> = {
  IMAGE: 15 * 1024 * 1024,
  PDF: 30 * 1024 * 1024,
  AUDIO: 30 * 1024 * 1024,
  VIDEO: 200 * 1024 * 1024,
};

/**
 * Validate, content-hash, and store uploaded files (image / pdf / video / audio).
 * - Empty / 0-byte files are skipped.
 * - Disallowed MIME type → rejected before any bytes are stored.
 * - Over the per-type size cap → rejected.
 * - Storage failure → a generic error (never blamed on the file type).
 */
export async function prepareAttachments(files: File[], storage: Storage): Promise<PreparedAttachment[]> {
  if (files.length > MAX_FILES) {
    throw new Error(`Demasiados archivos (máx. ${MAX_FILES}).`);
  }
  const out: PreparedAttachment[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    const kind = attachmentKindForType(file.type);
    if (!kind) {
      throw new Error("Tipo de archivo no permitido. Usa imagen, PDF, video o audio.");
    }
    if (file.size > SIZE_CAP[kind]) {
      throw new Error("Archivo demasiado grande.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    let saved: { url: string; key: string };
    try {
      saved = await storage.put({ buffer, filename: file.name, contentType: file.type });
    } catch {
      throw new Error("No se pudo guardar el archivo. Inténtalo de nuevo.");
    }
    out.push({ fileType: kind, url: saved.url, sha256 });
  }
  return out;
}
```

- [ ] **Step 4: Run it (passes)** — Run: `npm test -- upload-multimodal` — Expected: PASS. Then `npx tsc --noEmit` — Expected: exit 0 (`PreparedAttachment.fileType` is now `AttachmentType`, still assignable to `appendRegistro`'s `attachments` input and the `ChangeAttachment` create in `actions/cambios.ts`).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/registro/upload.ts web/tests/upload-multimodal.test.ts
git commit -m "feat(upload): accept pdf/video/audio, derive AttachmentType, per-type caps"
```

---

### Task 4: Raise server-action body limit

**Files:**
- Modify: `web/next.config.ts`

- [ ] **Step 1: Edit `web/next.config.ts`** to add the server-action body limit while keeping the temp tunnel origin:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TEMP (cloudflare quick-tunnel testing) — remove before merging.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Phone photos / PDFs exceed the 1 MB server-action default and were failing.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the dev server accepts the config** — Run: `npm run build` — Expected: build succeeds with no "Invalid next.config" / unknown-key warning. (If Next reports `serverActions` is not under `experimental` in this version, move it to a top-level `serverActions: { bodySizeLimit: "50mb" }` and rebuild — verify which the installed Next 15.5.x accepts.)

- [ ] **Step 3: Commit**

```bash
git add web/next.config.ts
git commit -m "fix(upload): raise server-action body limit to 50mb"
```

---

### Task 5: Render attachments by type + show author in RecordCard

**Files:**
- Modify: `web/src/components/record-card.tsx`

- [ ] **Step 1: Replace `web/src/components/record-card.tsx` with:**

```tsx
import type { Registro, Attachment, Location } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import Link from "next/link";
import { Pin, Check } from "@/components/icons";

type RecordT = { noGps: string; immutable: string; correct?: string; by?: string; document?: string };
type RegistroWithRelations = Registro & { attachments: Attachment[]; location: Location | null };

function Media({ a, t }: { a: Attachment; t: RecordT }) {
  const s = { width: "100%", borderRadius: "var(--radius-sm)", display: "block" } as const;
  if (a.fileType === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt="" style={s} />;
  }
  if (a.fileType === "VIDEO") return <video src={a.url} controls style={s} />;
  if (a.fileType === "AUDIO") return <audio src={a.url} controls style={{ width: "100%" }} />;
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px" }}>
      {t.document ?? "Document"}
    </a>
  );
}

export function RecordCard({
  r, t, lang, authorName, correctionHref,
}: {
  r: RegistroWithRelations;
  t: RecordT;
  lang: Lang;
  authorName?: string | null;
  correctionHref?: string;
}) {
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
        {authorName && (
          <div className="mono text-steel" style={{ fontSize: 11, marginBottom: 8 }}>{t.by ?? "by"} {authorName}</div>
        )}
        {r.location && (
          <div className="mono text-steel" style={{ fontSize: 11, marginBottom: 8 }}><Pin size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{r.location.label}</div>
        )}
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.attachments.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginTop: 4 }}>
            {r.attachments.map((a) => <Media key={a.id} a={a} t={t} />)}
          </div>
        )}
        <div className="mono text-steel" style={{ fontSize: 11, marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · <Check size={11} style={{ verticalAlign: -1, marginRight: 2 }} />{t.immutable}
        </div>
        {correctionHref && (
          <Link href={correctionHref} className="mono" style={{ display: "inline-flex", marginTop: 8, fontSize: 11, color: "var(--accent-deep)", textDecoration: "none" }}>
            {t.correct ?? "Correct"}
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/record-card.tsx
git commit -m "feat(notes): render video/audio/pdf attachments; show author"
```

---

### Task 6: Resolve note author names on the partida page

**Files:**
- Modify: `web/src/app/app/partidas/[id]/page.tsx`

- [ ] **Step 1: After the `partida` query, add author resolution.** Insert this block right after the `const partida = await prisma.partida.findFirstOrThrow({...});` call (before `const locationLabels`):

```tsx
  const authorIds = [...new Set(partida.registros.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds }, companyId }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));
```

- [ ] **Step 2: Pass `authorName` to each RecordCard.** Change the `RecordCard` usage in the `.map` to include the prop:

```tsx
        <RecordCard
          key={r.id}
          r={r}
          t={{ ...t.record, correct: correctionCopy.correct }}
          lang={lang}
          authorName={authorMap.get(r.authorId) ?? null}
          correctionHref={`/app/partidas/${partida.id}?correctionOf=${r.id}`}
        />
```

(`t.record` already carries `by`/`document` from Task 1, spread via `{...t.record}`.)

- [ ] **Step 3: Typecheck + build** — Run: `npx tsc --noEmit && npm run build` — Expected: exit 0 / build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/app/partidas/[id]/page.tsx"
git commit -m "feat(notes): show author name on each Cuaderno entry"
```

---

### Task 7: logRegistro returns a structured result

**Files:**
- Modify: `web/src/app/actions/registro.ts`
- Modify: `web/tests/registro-action-correction.test.ts`

- [ ] **Step 1: Rewrite `web/src/app/actions/registro.ts`** to a `useActionState`-compatible signature that never throws for expected errors:

```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseProgressPct, parseCategory, parseLocation } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export type LogResult = { ok: true } | { ok: false; error: string };

export async function logRegistro(_prev: LogResult | null, formData: FormData): Promise<LogResult> {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; companyId?: string } | undefined;
    if (!user?.id || !user.companyId) return { ok: false, error: "No autorizado." };
    const authorId = user.id;

    const partidaId = String(formData.get("partidaId"));
    const partida = await prisma.partida.findFirst({
      where: { id: partidaId, project: { companyId: user.companyId } },
    });
    if (!partida) return { ok: false, error: "No autorizado." };

    const text = (String(formData.get("text") ?? "").trim()) || null;
    const progressPct = parseProgressPct(formData.get("progressPct"));
    const category = parseCategory(formData.get("category"));
    const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
    const gpsLat = latRaw ? Number(latRaw) : null;
    const gpsLng = lngRaw ? Number(lngRaw) : null;

    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const attachments = await prepareAttachments(photos, storage);

    const locationLabel = parseLocation(formData.get("location"));
    let locationId: string | null = null;
    if (locationLabel) {
      const loc = await prisma.location.upsert({
        where: { projectId_label: { projectId: partida.projectId, label: locationLabel } },
        create: { projectId: partida.projectId, label: locationLabel },
        update: {},
      });
      locationId = loc.id;
    }

    const correctionRaw = formData.get("correctionOfId");
    const correctionOfId = typeof correctionRaw === "string" && correctionRaw.trim() ? correctionRaw.trim() : null;
    if (correctionOfId) {
      const corrected = await prisma.registro.findFirst({ where: { id: correctionOfId, partidaId }, select: { id: true } });
      if (!corrected) return { ok: false, error: "Invalid correction target" };
    }

    await appendRegistro({ partidaId, authorId, category, text, progressPct, gpsLat, gpsLng, locationId, attachments, correctionOfId });
    revalidatePath(`/app/partidas/${partidaId}`);
    return { ok: true };
  } catch (e) {
    // parse* validators throw user-facing Spanish messages; surface them.
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar." };
  }
}
```

- [ ] **Step 2: Update the existing correction test** `web/tests/registro-action-correction.test.ts` to the new signature/result. Change the two call sites + assertions:

The valid-correction test body becomes:
```typescript
    const res = await logRegistro(null, fd);
    expect(res.ok).toBe(true);
    const correction = await prisma.registro.findFirstOrThrow({
      where: { partidaId, text: "corrected note" },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    });
    expect(correction.correctionOfId).toBe(baseRegistroId);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/partidas/${partidaId}`);
```

The rejects-correction test body becomes:
```typescript
    const before = await prisma.registro.count({ where: { partidaId } });
    const fd = new FormData();
    fd.set("partidaId", partidaId);
    fd.set("text", "bad correction");
    fd.set("correctionOfId", otherRegistroId);
    const res = await logRegistro(null, fd);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/correction/i);
    await expect(prisma.registro.count({ where: { partidaId } })).resolves.toBe(before);
    expect(revalidatePathMock).not.toHaveBeenCalled();
```

(Leave the `beforeAll`/`afterAll`/mocks unchanged; only the two `it` bodies change to call `logRegistro(null, fd)` and assert on the returned result instead of `rejects.toThrow`.)

- [ ] **Step 3: Run the test (passes)** — Run: `npm test -- registro-action-correction` — Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/actions/registro.ts web/tests/registro-action-correction.test.ts
git commit -m "fix(notes): logRegistro returns structured result (no throw)"
```

---

### Task 8: Composer rework — useActionState (no wipe) + auto-GPS + wider upload

**Files:**
- Modify: `web/src/components/log-composer.tsx`

- [ ] **Step 1: Replace `web/src/components/log-composer.tsx` with:**

```tsx
"use client";
import { useEffect, useRef, useState, useId, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function LogComposer({
  partidaId, t, locations, correction,
}: {
  partidaId: string;
  t: ComposerT;
  locations: string[];
  correction?: { id: string; label: string; cancelLabel: string; notice: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [state, formAction] = useActionState(logRegistro, null);

  // Automatic GPS capture on mount (no button). Silent on denial — the note still saves.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }, []);

  // On success: clear the form and (if correcting) return to the partida. On
  // error: keep everything the user typed and show the message.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      if (correction) router.replace(`/app/partidas/${partidaId}`);
    }
  }, [state, correction, partidaId, router]);

  return (
    <form ref={formRef} action={formAction} className="card" style={{ padding: 16, marginBottom: 28 }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      {correction && <input type="hidden" name="correctionOfId" value={correction.id} />}
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      {correction && (
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: "0.7rem", marginBottom: 10 }}>
          <span>{correction.notice} {correction.label}</span>
          <Link href={`/app/partidas/${partidaId}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>{correction.cancelLabel}</Link>
        </div>
      )}
      <textarea name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      {state && !state.ok && (
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {state.error || t.error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select name="category" className="input" defaultValue="" style={{ width: "auto" }} aria-label={t.category}>
          <option value="">{t.noCategory}</option>
          {Object.entries(t.categories).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input name="location" list={listId} placeholder={t.location} className="input" style={{ maxWidth: 240 }} />
        <datalist id={listId}>
          {locations.map((l) => <option key={l} value={l} />)}
        </datalist>
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/webm" style={{ fontSize: "0.8rem", maxWidth: 220 }} />
        <input type="number" name="progressPct" min={0} max={100} placeholder={t.progress} className="input" style={{ width: 118 }} />
        <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{coords ? t.gpsOk : t.gps}</span>
        <SubmitButton className="btn btn-ink" style={{ marginLeft: "auto" }} pendingLabel={t.sending}>
          {t.submit} <span className="arrow">→</span>
        </SubmitButton>
      </div>
    </form>
  );
}
```

Notes: the GPS button is gone — capture is automatic; `t.gps`/`t.gpsOk` now label a small status (`Capturar GPS` reads oddly as a status, but we keep the dict unchanged this phase; a copy tweak can come later). The file input now accepts pdf/video/audio. `useActionState` means React does **not** auto-reset the form, so a failed submit preserves every field.

- [ ] **Step 2: Typecheck + build** — Run: `npx tsc --noEmit && npm run build` — Expected: exit 0 / build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/log-composer.tsx
git commit -m "fix(notes): auto-GPS + preserve form on error (useActionState); accept pdf/video/audio"
```

---

### Task 9: Full verification + manual pass

**Files:** none.

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all green (existing suites + `mime-multimodal`, `upload-multimodal`; `registro-action-correction` updated).
- [ ] **Step 2: Lint + types + build** — Run: `npm run lint && npx tsc --noEmit && npm run build` — Expected: clean; build lists the routes.
- [ ] **Step 3: No-emoji regression** — Run: `rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{FF0B}\x{25A0}-\x{25FF}]' src/` — Expected: no matches.
- [ ] **Step 4: Manual pass** (dev server; log in as `resident@record360.do` / `test1234`):
  - In a Partida, attach a **photo (>1 MB)** → it uploads and renders. Attach a **PDF** → shows a "Ver documento" link that opens. (Video: uploads; smooth seeking is a known storage-phase follow-up.)
  - Submit with a deliberately bad value (e.g. progress 999) → an inline error appears and **the typed text is preserved** (not wiped).
  - Confirm the GPS status shows captured **without** pressing a button (grant permission), and notes still save if permission denied.
  - Each entry shows the **author name**; the project summary link reads **"Abrir Cuaderno completo"**.

---

## Self-Review Notes

- **Spec coverage (§2/§9):** uploads multimodal + size (Tasks 2,3,4,8) · GPS auto (Task 8) · form-preserve (Tasks 7,8) · author name (Tasks 1,5,6) · Cuaderno rename (Task 1). All covered.
- **Type consistency:** `attachmentKindForType` (Task 2) consumed by `prepareAttachments` (Task 3); `PreparedAttachment.fileType: AttachmentType` flows into `appendRegistro`/`ChangeAttachment` unchanged. `RecordT` gains `by`/`document` (Task 1 dict + Task 5 type). `LogResult` (Task 7) consumed by `useActionState` (Task 8) and the correction test (Task 7).
- **Out of scope (later phases, by design):** moving progress off the composer (P2), Segmento→Bloque (P1), Planos/Partidas split (P1), Cambios rework (P3), video range/streaming + S3/R2 (cross-cutting). The composer still has the `progressPct` field this phase.
- **Risk:** the `experimental.serverActions.bodySizeLimit` key location may differ across Next 15.x — Task 4 step 2 verifies via build and gives the fallback.
