# Firma Partida — Authenticated Sign-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, tamper-evident sign-off (Firma) to a Partida's Cuaderno — requiring password re-verification and binding the signature to the current ledger hash chain head.

**Architecture:** A new `Signature` Prisma model stores per-signature snapshots (signer name/role, chain head, SHA-256 seal). The `signPartida` server action enforces bcrypt password re-auth and computes the seal over a canonical JSON payload. The UI renders existing signatures and a sign form on the Partida page. Signatures appear as a section in the PDF audit report.

**Tech Stack:** Next.js 15 App Router, Prisma 6, Neon Postgres, `bcryptjs`, `node:crypto`, PDFKit, Vitest (integration tests hit real DB via `.env.test`).

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `Signature` model + back-relations on `Partida` and `User` |
| `src/lib/signatures/seal.ts` | Create | `computeSignatureSeal` pure helper |
| `src/app/actions/signatures.ts` | Create | `signPartida` server action |
| `src/components/sign-partida-form.tsx` | Create | Client sign form component |
| `src/app/app/partidas/[id]/page.tsx` | Modify | Load signatures + render Firmas section |
| `src/i18n/dictionaries.ts` | Modify | Add `signatures` key (ES + EN, shape-synced) |
| `src/app/api/partidas/[id]/report/route.ts` | Modify | Append Firmas section to PDF |
| `web/tests/signature-seal.test.ts` | Create | Pure unit tests for `computeSignatureSeal` |
| `web/tests/sign-partida.test.ts` | Create | Integration tests for `signPartida` action |

---

## Task 1 — Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add the Signature model and back-relations**

Open `prisma/schema.prisma`.

After the `Notification` model (end of file), add:

```prisma
model Signature {
  id         String   @id @default(cuid())
  companyId  String
  partidaId  String
  partida    Partida  @relation(fields: [partidaId], references: [id])
  signerId   String
  signer     User     @relation(fields: [signerId], references: [id])
  signerName String
  signerRole Role
  statement  String?
  chainHead  String
  seal       String
  signedAt   DateTime @default(now())

  @@index([partidaId])
}
```

In the `Partida` model, add after `createdAt`:
```prisma
  signatures     Signature[]
```

In the `User` model, add after `createdAt`:
```prisma
  signatures     Signature[]
```

- [ ] **Step 1.2: Run the migration**

Working directory: `/Users/genel/Mirror/RECORD-360/web`

```bash
npx prisma migrate dev --name add_signatures
```

Expected: migration file created, migration applied, no errors. **Do NOT use `migrate reset`.**

- [ ] **Step 1.3: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` message. TypeScript now knows about `prisma.signature`.

- [ ] **Step 1.4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Signature model with chainHead + seal binding"
```

---

## Task 2 — Seal Helper (TDD)

**Files:**
- Create: `web/tests/signature-seal.test.ts`
- Create: `src/lib/signatures/seal.ts`

- [ ] **Step 2.1: Write the failing test first**

Create `/Users/genel/Mirror/RECORD-360/web/tests/signature-seal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeSignatureSeal, type SignatureSealInput } from "@/lib/signatures/seal";

const base: SignatureSealInput = {
  partidaId: "p1",
  signerId: "u1",
  signerName: "Ana Méndez",
  signerRole: "SUPERVISOR",
  statement: "Conforme con el avance",
  chainHead: "abc123def456",
  signedAt: new Date("2026-06-05T10:00:00Z"),
};

describe("computeSignatureSeal", () => {
  it("returns a 64-char hex digest", () => {
    const seal = computeSignatureSeal(base);
    expect(seal).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: same input → same hash", () => {
    expect(computeSignatureSeal(base)).toBe(computeSignatureSeal(base));
  });

  it("changes when signerId changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, signerId: "u2" })
    );
  });

  it("changes when chainHead changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, chainHead: "different" })
    );
  });

  it("changes when statement changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, statement: "Other statement" })
    );
  });

  it("changes when signedAt changes", () => {
    expect(computeSignatureSeal(base)).not.toBe(
      computeSignatureSeal({ ...base, signedAt: new Date("2026-06-05T11:00:00Z") })
    );
  });

  it("treats null statement differently from a non-null statement", () => {
    expect(computeSignatureSeal({ ...base, statement: null })).not.toBe(
      computeSignatureSeal({ ...base, statement: "anything" })
    );
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx vitest run tests/signature-seal.test.ts
```

Expected: FAIL — module `@/lib/signatures/seal` not found.

- [ ] **Step 2.3: Create the seal helper**

Create `/Users/genel/Mirror/RECORD-360/web/src/lib/signatures/seal.ts`:

```ts
// Server-only module: uses node:crypto. Never import into a client component.
// Canonical SHA-256 over the frozen signature payload — mirrors computeChangeSeal
// in src/lib/cambios/seal.ts.
import { createHash } from "node:crypto";

export interface SignatureSealInput {
  partidaId: string;
  signerId: string;
  signerName: string;
  signerRole: string;
  statement: string | null;
  chainHead: string;
  signedAt: Date;
}

export function computeSignatureSeal(input: SignatureSealInput): string {
  // Canonical, order-stable JSON (excludes id + seal). signedAt as ISO string.
  const canonical = JSON.stringify({
    partidaId: input.partidaId,
    signerId: input.signerId,
    signerName: input.signerName,
    signerRole: input.signerRole,
    statement: input.statement ?? null,
    chainHead: input.chainHead,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx vitest run tests/signature-seal.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add web/tests/signature-seal.test.ts src/lib/signatures/seal.ts
git commit -m "feat(signatures): computeSignatureSeal TDD — canonical SHA-256 over signature payload"
```

---

## Task 3 — signPartida Server Action (TDD)

**Files:**
- Create: `web/tests/sign-partida.test.ts`
- Create: `src/app/actions/signatures.ts`

- [ ] **Step 3.1: Write the failing test first**

Create `/Users/genel/Mirror/RECORD-360/web/tests/sign-partida.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import bcrypt from "bcryptjs";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { signPartida } from "@/app/actions/signatures";

const KNOWN_PASSWORD = "test-password-123";

let companyId = "";
let companyBId = "";
let userId = "";
let userBId = "";
let projectId = "";
let partidaId = "";
let partidaNoAccessId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const hash = await bcrypt.hash(KNOWN_PASSWORD, 10);

  // Company A with a SUPERVISOR user
  companyId = (await prisma.company.create({ data: { name: `Sig Co A ${s}` } })).id;
  userId = (await prisma.user.create({
    data: { email: `sig-u-${s}@x.do`, name: "Supervisora Test", role: "SUPERVISOR", companyId, passwordHash: hash },
  })).id;

  projectId = (await prisma.project.create({ data: { companyId, name: `Sig Project ${s}` } })).id;
  // Assign user to project (SUPERVISOR needs assignment)
  await prisma.projectAssignment.create({ data: { projectId, userId, role: "SUPERVISOR" } });

  partidaId = (await prisma.partida.create({ data: { projectId, name: "Sig Partida" } })).id;

  // Company B — for cross-company Forbidden test
  companyBId = (await prisma.company.create({ data: { name: `Sig Co B ${s}` } })).id;
  userBId = (await prisma.user.create({
    data: { email: `sig-ub-${s}@x.do`, name: "User B", role: "MANAGER", companyId: companyBId, passwordHash: hash },
  })).id;
  const projectBId = (await prisma.project.create({ data: { companyId: companyBId, name: `Sig Project B ${s}` } })).id;
  partidaNoAccessId = (await prisma.partida.create({ data: { projectId: projectBId, name: "No Access Partida" } })).id;
});

afterAll(async () => {
  await prisma.signature.deleteMany({ where: { companyId } });
  await prisma.signature.deleteMany({ where: { companyId: companyBId } });
  await prisma.registro.deleteMany({ where: { partidaId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  // Company B cleanup
  await prisma.partida.deleteMany({ where: { id: partidaNoAccessId } });
  await prisma.project.deleteMany({ where: { companyId: companyBId } });
  await prisma.user.deleteMany({ where: { id: userBId } });
  await prisma.company.deleteMany({ where: { id: companyBId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  authMock.mockReset();
  revalidatePathMock.mockReset();
});

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function asUser() {
  authMock.mockResolvedValue({ user: { id: userId, companyId, role: "SUPERVISOR" } });
}

describe("signPartida", () => {
  it("correct password → creates a Signature with snapshots, chainHead from latest registro, and 64-char seal", async () => {
    // Append a registro so chainHead is non-empty
    await appendRegistro({
      partidaId, authorId: userId, category: null, text: "Avance final",
      progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [],
    });
    const latestRegistro = await prisma.registro.findFirst({
      where: { partidaId },
      orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    expect(latestRegistro?.hash).toBeTruthy();

    asUser();
    await signPartida(fd({
      partidaId,
      password: KNOWN_PASSWORD,
      statement: "Conforme con el avance registrado.",
    }));

    const sig = await prisma.signature.findFirst({
      where: { partidaId, signerId: userId },
      orderBy: { signedAt: "desc" },
    });
    expect(sig).not.toBeNull();
    expect(sig!.signerName).toBe("Supervisora Test");
    expect(sig!.signerRole).toBe("SUPERVISOR");
    expect(sig!.chainHead).toBe(latestRegistro!.hash);
    expect(sig!.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(sig!.statement).toBe("Conforme con el avance registrado.");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/app/partidas/${partidaId}`);
  });

  it("correct password on empty cuaderno → chainHead is empty string", async () => {
    const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const emptyPartida = await prisma.partida.create({ data: { projectId, name: `Empty ${s}` } });

    asUser();
    await signPartida(fd({ partidaId: emptyPartida.id, password: KNOWN_PASSWORD }));

    const sig = await prisma.signature.findFirstOrThrow({ where: { partidaId: emptyPartida.id } });
    expect(sig.chainHead).toBe("");

    // cleanup
    await prisma.signature.deleteMany({ where: { partidaId: emptyPartida.id } });
    await prisma.partida.delete({ where: { id: emptyPartida.id } });
  });

  it("wrong password → throws 'Contraseña incorrecta.', no row created", async () => {
    const before = await prisma.signature.count({ where: { partidaId } });
    asUser();
    await expect(
      signPartida(fd({ partidaId, password: "wrong-password" }))
    ).rejects.toThrow("Contraseña incorrecta.");
    expect(await prisma.signature.count({ where: { partidaId } })).toBe(before);
  });

  it("partida from another company → throws 'Forbidden'", async () => {
    authMock.mockResolvedValue({ user: { id: userId, companyId, role: "SUPERVISOR" } });
    await expect(
      signPartida(fd({ partidaId: partidaNoAccessId, password: KNOWN_PASSWORD }))
    ).rejects.toThrow("Forbidden");
  });

  it("unauthenticated → throws 'Unauthorized'", async () => {
    authMock.mockResolvedValue(null);
    await expect(
      signPartida(fd({ partidaId, password: KNOWN_PASSWORD }))
    ).rejects.toThrow("Unauthorized");
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx vitest run tests/sign-partida.test.ts
```

Expected: FAIL — module `@/app/actions/signatures` not found.

- [ ] **Step 3.3: Implement the signPartida action**

Create `/Users/genel/Mirror/RECORD-360/web/src/app/actions/signatures.ts`:

```ts
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { projectAccessWhere } from "@/lib/authz/projects";
import { computeSignatureSeal } from "@/lib/signatures/seal";

export async function signPartida(formData: FormData): Promise<void> {
  // 1. Auth
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId") ?? "");

  // 2. Tenant + project-access scope
  const partida = await prisma.partida.findFirst({
    where: {
      id: partidaId,
      deletedAt: null,
      project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }),
    },
    select: { id: true },
  });
  if (!partida) throw new Error("Forbidden");

  // 3. Re-authenticate: load the user's passwordHash + name + role snapshot
  const signerRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, name: true, role: true },
  });
  if (!signerRecord) throw new Error("Unauthorized");

  const password = String(formData.get("password") ?? "");
  const passwordOk = await bcrypt.compare(password, signerRecord.passwordHash);
  if (!passwordOk) throw new Error("Contraseña incorrecta.");

  // 4. Chain head: latest registro hash (or "" if none)
  const latestRegistro = await prisma.registro.findFirst({
    where: { partidaId },
    orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const chainHead = latestRegistro?.hash ?? "";

  // 5. Optional statement
  const statement = String(formData.get("statement") ?? "").trim() || null;

  // 6. Compute seal
  const signedAt = new Date();
  const seal = computeSignatureSeal({
    partidaId,
    signerId: user.id,
    signerName: signerRecord.name,
    signerRole: signerRecord.role,
    statement,
    chainHead,
    signedAt,
  });

  // 7. Persist
  await prisma.signature.create({
    data: {
      companyId: user.companyId,
      partidaId,
      signerId: user.id,
      signerName: signerRecord.name,
      signerRole: signerRecord.role,
      statement,
      chainHead,
      seal,
      signedAt,
    },
  });

  revalidatePath(`/app/partidas/${partidaId}`);
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx vitest run tests/sign-partida.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add web/tests/sign-partida.test.ts src/app/actions/signatures.ts
git commit -m "feat(signatures): signPartida server action — bcrypt re-auth, chainHead binding, seal"
```

---

## Task 4 — i18n Strings

**Files:**
- Modify: `src/i18n/dictionaries.ts`

- [ ] **Step 4.1: Add the `signatures` key to the ES locale**

In `src/i18n/dictionaries.ts`, inside the `es` object, after the `pager` key (before the closing `},`):

```ts
    signatures: {
      title: "Firmas",
      sign: "Firmar",
      password: "Contraseña",
      statement: "Declaración (opcional)",
      statementPlaceholder: "Lo que el firmante atesta…",
      signedBy: "Firmado por",
      boundTo: "Estado del Cuaderno",
      emptyLedger: "Cuaderno vacío",
      none: "Aún no hay firmas.",
      signing: "Firmando…",
      error: "No se pudo firmar. Inténtalo de nuevo.",
    },
```

- [ ] **Step 4.2: Add the same `signatures` key to the EN locale**

In the `en` object, after the `pager` key:

```ts
    signatures: {
      title: "Signatures",
      sign: "Sign",
      password: "Password",
      statement: "Declaration (optional)",
      statementPlaceholder: "What the signer attests…",
      signedBy: "Signed by",
      boundTo: "Notebook state",
      emptyLedger: "Empty notebook",
      none: "No signatures yet.",
      signing: "Signing…",
      error: "Could not sign. Please try again.",
    },
```

- [ ] **Step 4.3: Verify TypeScript is happy**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors. (The `Dict` type derives from `es`, so the EN object must have the same shape.)

- [ ] **Step 4.4: Commit**

```bash
git add src/i18n/dictionaries.ts
git commit -m "feat(i18n): add signatures strings to ES + EN dictionaries"
```

---

## Task 5 — SignPartidaForm Client Component

**Files:**
- Create: `src/components/sign-partida-form.tsx`

- [ ] **Step 5.1: Create the client form component**

Create `/Users/genel/Mirror/RECORD-360/web/src/components/sign-partida-form.tsx`:

```tsx
"use client";
import { useRef, useActionState } from "react";
import { signPartida } from "@/app/actions/signatures";
import { SubmitButton } from "@/components/submit-button";

type SignaturesT = {
  sign: string;
  password: string;
  statement: string;
  statementPlaceholder: string;
  signing: string;
  error: string;
};

export function SignPartidaForm({
  partidaId,
  t,
}: {
  partidaId: string;
  t: SignaturesT;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, fd: FormData) => {
      try {
        await signPartida(fd);
        formRef.current?.reset();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.error;
        return { ok: false, error: msg };
      }
    },
    null
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="card"
      style={{ padding: 16, marginTop: 12 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      {state && !state.ok && (
        <p
          role="alert"
          style={{
            background: "rgba(225,74,31,0.08)",
            border: "1px solid var(--accent)",
            color: "var(--accent-deep)",
            padding: "8px 11px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.84rem",
            marginBottom: 10,
          }}
        >
          {state.error || t.error}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="password"
          name="password"
          required
          placeholder={t.password}
          className="input"
          autoComplete="current-password"
        />
        <input
          name="statement"
          placeholder={t.statementPlaceholder}
          className="input"
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SubmitButton className="btn btn-ink" pendingLabel={t.signing}>
            {t.sign} <span className="arrow">→</span>
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 5.2: Verify TypeScript**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/sign-partida-form.tsx
git commit -m "feat(ui): SignPartidaForm client component — password re-auth form"
```

---

## Task 6 — Firmas Section on the Partida Page

**Files:**
- Modify: `src/app/app/partidas/[id]/page.tsx`

- [ ] **Step 6.1: Load signatures and add the Firmas section**

In `src/app/app/partidas/[id]/page.tsx`:

1. Add imports at the top:

```ts
import { SignPartidaForm } from "@/components/sign-partida-form";
```

2. After the `replyTarget` query (before the `return`), add:

```ts
  // Load signatures for this partida (most recent first)
  const signatures = await prisma.signature.findMany({
    where: { partidaId: id },
    orderBy: { signedAt: "desc" },
  });
```

3. In the JSX, after the pagination block (before the closing `</div>`), add:

```tsx
      {/* ── Firmas ────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <h2 className="kicker" style={{ marginBottom: 12, color: "var(--steel)", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          {t.signatures.title}
        </h2>
        {signatures.length === 0 && (
          <p className="text-steel" style={{ fontSize: "0.88rem", marginBottom: 12 }}>
            {t.signatures.none}
          </p>
        )}
        {signatures.map((sig) => {
          const chainDisplay = sig.chainHead
            ? `${sig.chainHead.slice(0, 8)}…${sig.chainHead.slice(-4)}`
            : t.signatures.emptyLedger;
          const sealDisplay = `${sig.seal.slice(0, 8)}…${sig.seal.slice(-4)}`;
          const dateDisplay = sig.signedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
          return (
            <div
              key={sig.id}
              className="card"
              style={{ padding: "12px 16px", marginBottom: 10, fontSize: "0.85rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{sig.signerName}</span>
                <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{dateDisplay}</span>
              </div>
              <div className="text-steel" style={{ fontSize: "0.78rem", marginBottom: 4 }}>
                {sig.signerRole}
              </div>
              {sig.statement && (
                <p style={{ margin: "6px 0", fontStyle: "italic" }}>{sig.statement}</p>
              )}
              <div className="mono" style={{ fontSize: "0.7rem", color: "var(--steel)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>SELLO {sealDisplay}</span>
                <span>{t.signatures.boundTo}: {chainDisplay}</span>
              </div>
            </div>
          );
        })}
        <SignPartidaForm
          partidaId={partida.id}
          t={{
            sign: t.signatures.sign,
            password: t.signatures.password,
            statement: t.signatures.statement,
            statementPlaceholder: t.signatures.statementPlaceholder,
            signing: t.signatures.signing,
            error: t.signatures.error,
          }}
        />
      </div>
```

- [ ] **Step 6.2: Verify TypeScript**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6.3: Run lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm run lint
```

Expected: no errors.

- [ ] **Step 6.4: Run emoji scan**

```bash
rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' /Users/genel/Mirror/RECORD-360/web/src/
```

Expected: no matches.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/app/partidas/[id]/page.tsx
git commit -m "feat(ui): Firmas section on Partida page — signatures list + SignPartidaForm"
```

---

## Task 7 — Signatures in the PDF Report

**Files:**
- Modify: `src/app/api/partidas/[id]/report/route.ts`

- [ ] **Step 7.1: Load signatures in the route handler**

In `src/app/api/partidas/[id]/report/route.ts`, modify the `partida` query: add a `signatures` include **outside** the existing `partidas` include block. Add after line ~66 (after the `registros` include, inside the `include` object):

```ts
      signatures: {
        orderBy: [{ signedAt: "asc" }],
      },
```

So the full `include` on the partida query becomes:

```ts
    include: {
      project: {
        include: {
          company: { select: { name: true } },
        },
      },
      registros: {
        orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
        include: {
          attachments: true,
          location: true,
        },
      },
      signatures: {
        orderBy: [{ signedAt: "asc" }],
      },
    },
```

- [ ] **Step 7.2: Append the Firmas section to the PDF**

In the same file, after the page-numbers loop (after the `for (let i = 0; i < pageCount; i++)` block closes), add:

```ts
  // ── Firmas section ───────────────────────────────────────────────────────
  // Signatures are appended after registros. Switching to a fresh page if needed
  // is handled automatically by pdfkit when content overflows.
  doc.addPage();
  doc.font(FONT_BOLD).fontSize(13).fillColor(PRIMARY).text("Firmas", { underline: false });
  doc.moveDown(0.4);
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#333333")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  if (partida.signatures.length === 0) {
    doc.font(FONT_NORMAL).fontSize(10).fillColor(MUTED).text("Sin firmas.");
  } else {
    for (const sig of partida.signatures) {
      const sigDate = sig.signedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
      doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY);
      doc.text(`${sigDate}  ·  ${sig.signerName} (${sig.signerRole})`);

      if (sig.statement) {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY);
        doc.text(sig.statement, { lineGap: 1 });
      }

      const chainLabel = sig.chainHead || "Cuaderno vacío al firmar";
      doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED);
      doc.text(`SELLO ${sig.seal}`);
      doc.text(`Estado del Cuaderno: ${chainLabel}`);

      doc.moveDown(0.4);
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(RULE_COLOR)
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.5);
    }
  }
```

**Important:** The `doc.addPage()` call and signature block must be placed **before** `doc.end()`. Locate the `doc.end()` call and place this block immediately before it. Also remove the `doc.addPage()` call from the plan and instead insert the block directly before `doc.end()` — do NOT add a new page unconditionally; instead, just continue after the page-numbers loop without `addPage()`, since pdfkit flows content naturally. Revised approach: simply add the section content after the page-numbers loop ends (no `doc.addPage()`), let pdfkit flow it naturally.

Actually, the cleanest approach: move the page-numbers footer rendering to happen AFTER all content (including signatures) is written. Pdfkit's `bufferedPageRange` only works before `doc.end()`. Here is the correct structure:

```
// write registro blocks
// write signatures section  ← add here, before page numbers
// page numbers loop
// doc.end()
```

The page-numbers loop must come last because it iterates `doc.bufferedPageRange().count`. So:

1. Find the comment `// ── Page numbers ──` and its loop in the file.
2. Insert the signatures section block **between the registro loop and the page-numbers loop**.
3. Remove the `doc.addPage()` call — just continue with normal flow.

Here is the exact block to insert between the registro loop and the `// ── Page numbers ──` comment:

```ts
  // ── Firmas section ───────────────────────────────────────────────────────
  doc.moveDown(1.2);
  doc.font(FONT_BOLD).fontSize(13).fillColor(PRIMARY).text("Firmas");
  doc.moveDown(0.4);
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#333333")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  if (partida.signatures.length === 0) {
    doc.font(FONT_NORMAL).fontSize(10).fillColor(MUTED).text("Sin firmas.");
    doc.moveDown(0.5);
  } else {
    for (const sig of partida.signatures) {
      const sigDate = sig.signedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
      doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY);
      doc.text(`${sigDate}  ·  ${sig.signerName} (${sig.signerRole})`);

      if (sig.statement) {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY);
        doc.text(sig.statement, { lineGap: 1 });
      }

      const chainLabel = sig.chainHead || "Cuaderno vacío al firmar";
      doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED);
      doc.text(`SELLO ${sig.seal}`);
      doc.text(`Estado del Cuaderno: ${chainLabel}`);

      doc.moveDown(0.4);
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(RULE_COLOR)
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.5);
    }
  }
```

- [ ] **Step 7.3: Run existing report tests**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx vitest run tests/report-route.test.ts
```

Expected: all 3 tests PASS (200/pdf, 404 cross-company, 401 unauthenticated).

- [ ] **Step 7.4: Commit**

```bash
git add src/app/api/partidas/[id]/report/route.ts
git commit -m "feat(pdf): append Firmas section to audit report with seal + chain-state per signature"
```

---

## Task 8 — Full Verification + Final Commit

**Files:** None new. Verification only.

- [ ] **Step 8.1: Run all tests**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test
```

Expected: all tests pass — including `signature-seal`, `sign-partida`, `report-route`, and all pre-existing tests.

- [ ] **Step 8.2: TypeScript check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8.3: Lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm run lint
```

Expected: clean (no errors, no warnings).

- [ ] **Step 8.4: Emoji scan**

```bash
rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' /Users/genel/Mirror/RECORD-360/web/src/
```

Expected: no matches.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1: `Signature` schema with all fields, back-relations, migration
- [x] Task 2: `computeSignatureSeal` with full TDD (deterministic, field-sensitivity)
- [x] Task 3: `signPartida` action — auth, project-scope, bcrypt re-auth, chainHead, statement, seal, persist, revalidate
- [x] Task 3 tests: correct pw + snapshots + chainHead, wrong pw + no row, cross-company Forbidden, unauthenticated Unauthorized, empty cuaderno chainHead=""
- [x] Task 4: `signatures` i18n object in ES + EN, shape-synced
- [x] Task 5: `SignPartidaForm` client component — password field, statement field, SubmitButton, error display, form reset on success
- [x] Task 6: Partida page loads signatures, renders Firmas section with seal/chain display and the form
- [x] Task 7: PDF report loads signatures, appends Firmas section, existing report-route tests still pass
- [x] No emoji in UI per Raphl rule
- [x] No `migrate reset` — additive migration only
- [x] Registro hash chain untouched — `Signature` is a separate table
- [x] Teardown in test cleans `prisma.signature.deleteMany` before partida/project deletions (FK safe)
- [x] `bcryptjs` used (not `bcrypt`) — consistent with existing `admin.ts` pattern
- [x] `projectAccessWhere` used for tenant-scoped partida lookup
- [x] `revalidatePath` called with correct path

**Placeholder scan:** No TBD, TODO, or "similar to" references. All code blocks are complete.

**Type consistency:**
- `SignatureSealInput` defined in `seal.ts`, referenced identically in tests and action
- `SignaturesT` prop type in `sign-partida-form.tsx` matches the keys passed from the page
- `partida.signatures` available after Prisma include — only accessible once migration + generate runs (Task 1)
