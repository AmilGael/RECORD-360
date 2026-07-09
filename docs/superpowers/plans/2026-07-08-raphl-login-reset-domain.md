# Login Entry Points + Self-Service Password Reset + raphel360.com Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add request-access + forgot-password entry points to the login page, build self-service password reset on the existing verification-token infrastructure, convert the admin reset to send the same link (no email ever carries a credential), and document the raphel360.com domain runbook.

**Architecture:** New `PASSWORD_RESET` value on the existing `TokenPurpose` enum; `src/lib/auth/tokens.ts` generalized to purpose-parameterized mint/verify/consume (existing ACTIVATION exports stay as thin wrappers so no call site changes). Two new server actions in `src/app/actions/password-reset.ts` mirror the proven `requestAccess`/`activateAccount` patterns (enumeration-safe neutral responses, DB-backed IP rate limits, atomic single-use token claim). The admin `resetUserPassword` swaps its temp-password mechanics for the same reset link.

**Tech Stack:** Next.js 15 server actions, Prisma/Postgres (Neon dev), Auth.js v5, bcryptjs, vitest (tests hit the dev DB directly).

**Spec:** `docs/superpowers/specs/2026-07-08-raphl-login-reset-domain-design.md`

## Global Constraints

- All work on branch `feat/web-security-hardening`; run commands from `web/`.
- Vitest runs load `.env.local` automatically (`npm test`); a single file: `npx vitest run tests/<file>.test.ts`.
- Password policy: **12+ chars** via `validatePassword` from `@/lib/auth/password-policy` — never re-implement.
- Rate limiter: `rateLimit(key, max, windowMs)` from `@/lib/auth/rate-limit` (DB-backed on the `loginAttempt` table). Reset intake = `reset:${ip}`, **5/hour**. Reset completion = `resetpw:${ip}`, **10/hour**.
- Token TTLs: ACTIVATION **24h**, PASSWORD_RESET **2h**.
- Enumeration safety: unknown / unactivated / disabled accounts must produce the exact same neutral object (`{ status: "sent" }`) as the happy path.
- **No email may ever contain a credential** (password, temp password, or hash).
- UI copy is Spanish-first with es/en dictionary keys (`src/i18n/dictionaries.ts`); NO emoji; match existing inline-style card markup.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (heredoc format).

## File Structure

- `prisma/schema.prisma` — `TokenPurpose` gains `PASSWORD_RESET` (Task 1)
- `src/lib/auth/tokens.ts` — purpose-parameterized core + `resetUrl` (Task 2)
- `src/lib/email/templates.ts` — add `passwordResetLinkEmail`; later delete `passwordResetEmail`, `userInviteEmail`, `loginLink` (Tasks 3, 5)
- `src/app/actions/password-reset.ts` — NEW: `requestPasswordReset` + `resetPassword` (Task 4)
- `src/app/actions/admin.ts` — rework `resetUserPassword` (Task 5)
- `src/app/app/admin/page.tsx` — swap temp-password banner for reset-link banner (Task 5)
- `src/auth.config.ts` — public paths `/forgot-password`, `/reset` (Task 6)
- `src/app/login/page.tsx` — two links + `reset=1` flash (Task 6)
- `src/i18n/dictionaries.ts` — login keys add `forgot`/`noAccount`/`resetDone`; admin keys drop `tempPre`/`tempPost`, add `resetSent` (Tasks 5, 6)
- `src/components/password-fields.tsx` — NEW shared password+confirm inputs (Task 7)
- `src/app/forgot-password/page.tsx`, `src/app/reset/[token]/page.tsx` — NEW pages (Task 7)
- `src/app/activate/[token]/page.tsx` — use shared component (Task 7)
- `.env.example`, `docs/deployment-raphel360.md` — domain runbook (Task 8)
- Tests: extend `tests/tokens.test.ts`, `tests/email.test.ts`; NEW `tests/password-reset-request.test.ts`, `tests/password-reset-confirm.test.ts`, `tests/public-paths.test.ts`; REWRITE `tests/password-reset.test.ts`

---

### Task 1: Schema — `PASSWORD_RESET` token purpose

**Files:**
- Modify: `prisma/schema.prisma` (the `TokenPurpose` enum)

**Interfaces:**
- Produces: `TokenPurpose.PASSWORD_RESET` usable from `@prisma/client` in all later tasks.

- [ ] **Step 1: Edit the enum** in `prisma/schema.prisma`:

```prisma
enum TokenPurpose {
  ACTIVATION
  PASSWORD_RESET
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name password_reset_token_purpose`
(Prisma reads `web/.env`, which carries the dev `DATABASE_URL` — same invocation as every existing migration in `prisma/migrations/`.)
Expected: a new folder `prisma/migrations/*_password_reset_token_purpose/` containing `ALTER TYPE "TokenPurpose" ADD VALUE 'PASSWORD_RESET';`, and `prisma generate` runs.

- [ ] **Step 3: Sanity-check the migration + client**

Run: `grep -r "ADD VALUE" prisma/migrations/*password_reset_token_purpose/migration.sql && grep -c "PASSWORD_RESET" node_modules/.prisma/client/index.d.ts`
Expected: the ALTER TYPE line, and a non-zero count from the generated client.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(auth): PASSWORD_RESET token purpose (schema)"
```

---

### Task 2: Token library — purpose-parameterized core

**Files:**
- Modify: `src/lib/auth/tokens.ts` (full rewrite below)
- Test: `tests/tokens.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `TokenPurpose.PASSWORD_RESET` (Task 1).
- Produces (used by Tasks 4, 5):
  - `createToken(userId: string, purpose: TokenPurpose, now?: Date): Promise<string>` — returns RAW token
  - `verifyToken(raw: string, purpose: TokenPurpose, now?: Date): Promise<{ id: string; userId: string } | null>`
  - `consumeTokens(tx: Prisma.TransactionClient, userId: string, purpose: TokenPurpose, now?: Date): Promise<void>`
  - `resetUrl(rawToken: string): string` — `${APP_URL}/reset/<raw>`
  - Existing exports (`createActivationToken`, `verifyActivationToken`, `consumeActivationTokens`, `activationUrl`, `hashToken`) keep their exact signatures — **no call-site changes anywhere else**.

- [ ] **Step 1: Write the failing tests** — append to `tests/tokens.test.ts`:

```ts
describe("purpose-parameterized tokens", () => {
  it("rejects a token verified under the wrong purpose (both directions)", async () => {
    const u = await mkUser("purpose-iso");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION);
    const rst = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    expect(await verifyToken(act, TokenPurpose.PASSWORD_RESET)).toBeNull();
    expect(await verifyToken(rst, TokenPurpose.ACTIVATION)).toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION)).not.toBeNull();
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET)).not.toBeNull();
  });

  it("PASSWORD_RESET tokens expire after 2h; ACTIVATION lasts 24h", async () => {
    const u = await mkUser("purpose-ttl");
    const minted = new Date("2026-07-08T12:00:00Z");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION, minted);
    const rst = await createToken(u.id, TokenPurpose.PASSWORD_RESET, minted);
    const at = (h: number) => new Date(minted.getTime() + h * 3600_000);
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET, at(1.9))).not.toBeNull();
    expect(await verifyToken(rst, TokenPurpose.PASSWORD_RESET, at(2.1))).toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION, at(23.9))).not.toBeNull();
    expect(await verifyToken(act, TokenPurpose.ACTIVATION, at(24.1))).toBeNull();
  });

  it("consumeTokens only consumes the given purpose", async () => {
    const u = await mkUser("purpose-consume");
    await createToken(u.id, TokenPurpose.ACTIVATION);
    await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await prisma.$transaction((tx) => consumeTokens(tx, u.id, TokenPurpose.PASSWORD_RESET));
    const rows = await prisma.verificationToken.findMany({ where: { userId: u.id } });
    expect(rows.find((r) => r.purpose === "PASSWORD_RESET")?.consumedAt).not.toBeNull();
    expect(rows.find((r) => r.purpose === "ACTIVATION")?.consumedAt).toBeNull();
  });

  it("resetUrl builds APP_URL/reset/<raw>", () => {
    expect(resetUrl("abc")).toMatch(/\/reset\/abc$/);
  });
});
```

Add the imports at the top of the file alongside the existing ones: `createToken, verifyToken, consumeTokens, resetUrl` from `@/lib/auth/tokens`, and `TokenPurpose` from `@prisma/client`. If `tests/tokens.test.ts` has no `mkUser` helper, add one matching its existing user-creation pattern (company + user with the file's `tag` prefix so its `afterAll` cleanup catches them):

```ts
async function mkUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({ data: { email: `${tag}-${s}@example.com`, name: "T", role: "ADMIN", companyId: co.id } });
}
```

(Read the file first — reuse its existing helper if one exists, and make sure the cleanup patterns cover the new rows.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tokens.test.ts`
Expected: FAIL — `createToken` / `verifyToken` / `consumeTokens` / `resetUrl` are not exported.

- [ ] **Step 3: Implement** — replace `src/lib/auth/tokens.ts` with:

```ts
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { TokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Per-purpose token lifetime. Reset links are short-lived on purpose. */
const TTL_MS: Record<TokenPurpose, number> = {
  [TokenPurpose.ACTIVATION]: 24 * 60 * 60 * 1000,
  [TokenPurpose.PASSWORD_RESET]: 2 * 60 * 60 * 1000,
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a token for a user. Returns the RAW token (only time it exists). */
export async function createToken(userId: string, purpose: TokenPurpose, now = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      purpose,
      userId,
      expiresAt: new Date(now.getTime() + TTL_MS[purpose]),
    },
  });
  return raw;
}

/** Return {id,userId} if the token is valid for this purpose (exists, unexpired, unconsumed), else null. */
export async function verifyToken(
  raw: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt <= now) return null;
  return { id: row.id, userId: row.userId };
}

/** Consume all outstanding tokens of one purpose for a user (single-use enforcement). */
export async function consumeTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<void> {
  await tx.verificationToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: now },
  });
}

// ── ACTIVATION wrappers (existing call sites in access.ts / activation.ts / admin.ts) ──

export async function createActivationToken(userId: string, now = new Date()): Promise<string> {
  return createToken(userId, TokenPurpose.ACTIVATION, now);
}

export async function verifyActivationToken(raw: string, now = new Date()) {
  return verifyToken(raw, TokenPurpose.ACTIVATION, now);
}

export async function consumeActivationTokens(tx: Prisma.TransactionClient, userId: string, now = new Date()): Promise<void> {
  return consumeTokens(tx, userId, TokenPurpose.ACTIVATION, now);
}

function baseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Absolute activation link. Falls back to localhost in dev so the email always has a link. */
export function activationUrl(rawToken: string): string {
  return `${baseUrl()}/activate/${rawToken}`;
}

/** Absolute password-reset link. Same fallback behavior as activationUrl. */
export function resetUrl(rawToken: string): string {
  return `${baseUrl()}/reset/${rawToken}`;
}
```

- [ ] **Step 4: Run to verify pass** — both the new block and all pre-existing token/activation tests:

Run: `npx vitest run tests/tokens.test.ts tests/activate-action.test.ts`
Expected: PASS (wrappers keep old behavior byte-identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/tokens.ts tests/tokens.test.ts
git commit -m "feat(auth): purpose-parameterized token library (2h reset TTL, purpose isolation)"
```

---

### Task 3: Email template — `passwordResetLinkEmail`

**Files:**
- Modify: `src/lib/email/templates.ts` (append one function; delete nothing yet)
- Test: `tests/email.test.ts` (append)

**Interfaces:**
- Produces (used by Tasks 4, 5): `passwordResetLinkEmail(to: string, name: string, resetUrl: string): EmailMessage`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe("templates", ...)` in `tests/email.test.ts` (import `passwordResetLinkEmail` at the top):

```ts
it("password reset link email carries the link and no credential material", () => {
  const msg = passwordResetLinkEmail("u@x.do", "<b>Ana</b>", "https://raphel360.com/reset/RAWTOKEN");
  expect(msg.to).toBe("u@x.do");
  expect(msg.subject).toMatch(/contraseña/i);
  expect(msg.text).toContain("https://raphel360.com/reset/RAWTOKEN");
  expect(msg.html).toContain('href="https://raphel360.com/reset/RAWTOKEN"');
  expect(msg.html).toContain("&lt;b&gt;Ana&lt;/b&gt;"); // name escaped
  expect(msg.text).toMatch(/2 horas/); // states the short validity window
  expect(msg.text).not.toMatch(/contraseña temporal/i); // never a credential
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/email.test.ts`
Expected: FAIL — `passwordResetLinkEmail` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/email/templates.ts`:

```ts
/** Sent when a user (or their admin) requests a password reset: a single-use link, never a credential. */
export function passwordResetLinkEmail(to: string, name: string, resetUrl: string): EmailMessage {
  return {
    to,
    subject: `${APP_NAME}: restablece tu contraseña`,
    text:
      `Hola ${name},\n\n` +
      `Restablece tu contraseña de ${APP_NAME} con este enlace (válido por 2 horas):\n\n` +
      `${resetUrl}\n\n` +
      `Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue vigente.`,
    html:
      `<p>Hola ${esc(name)},</p>` +
      `<p>Restablece tu contraseña de <b>${APP_NAME}</b> con este enlace (válido por 2 horas):</p>` +
      `<p><a href="${esc(resetUrl)}">Restablecer contraseña</a></p>` +
      `<p>Si no solicitaste este cambio, ignora este correo — tu contraseña actual sigue vigente.</p>`,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/email.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates.ts tests/email.test.ts
git commit -m "feat(email): password reset link template (2h validity, no credential)"
```

---

### Task 4: `requestPasswordReset` + `resetPassword` actions

**Files:**
- Create: `src/app/actions/password-reset.ts`
- Test: `tests/password-reset-request.test.ts`, `tests/password-reset-confirm.test.ts`

**Interfaces:**
- Consumes: `createToken`/`verifyToken`/`consumeTokens`/`resetUrl` (Task 2), `passwordResetLinkEmail` (Task 3), `validatePassword`, `rateLimit`/`clientIp`, `writeAudit`, `sendBestEffort`.
- Produces (used by Task 7's pages):
  - `requestPasswordReset(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState>` with `type ForgotPasswordState = { status: "idle" | "sent" | "error"; message?: string }`
  - `resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState>` with `type ResetPasswordState = { status: "idle" | "error"; message?: string }`; success = `redirect("/login?reset=1")`

- [ ] **Step 1: Write the failing intake tests** — `tests/password-reset-request.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendMock = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("9.9.9.9"));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));

import { requestPasswordReset } from "@/app/actions/password-reset";
import { Role, TokenPurpose } from "@prisma/client";

const tag = `pwreq-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
const call = (email: string, extra: Record<string, string> = {}) =>
  requestPasswordReset({ status: "idle" }, fd({ email, ...extra }));

async function mkUser(s: string, data: { emailVerifiedAt?: Date | null; disabledAt?: Date | null } = {}) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${s}@example.com`, name: "T", role: Role.ADMIN, companyId: co.id,
      passwordHash: "x", emailVerifiedAt: data.emailVerifiedAt === undefined ? new Date() : data.emailVerifiedAt,
      disabledAt: data.disabledAt ?? null,
    },
  });
}
const tokenCount = (userId: string) =>
  prisma.verificationToken.count({ where: { userId, purpose: TokenPurpose.PASSWORD_RESET } });

afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "reset:" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  sendMock.mockReset();
  headerGet.mockReturnValue("9.9.9.9");
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "reset:" } } });
});

describe("requestPasswordReset", () => {
  it("mints a PASSWORD_RESET token and emails a /reset/ link for an eligible account", async () => {
    const u = await mkUser("ok");
    const res = await call(u.email);
    expect(res).toEqual({ status: "sent" });
    expect(await tokenCount(u.id)).toBe(1);
    expect(sendMock).toHaveBeenCalledOnce();
    const msg = sendMock.mock.calls[0][0];
    expect(msg.to).toBe(u.email);
    expect(msg.text).toMatch(/\/reset\//);
  });

  it("returns the identical neutral object for unknown, unactivated, and disabled accounts — and mints nothing", async () => {
    const unact = await mkUser("unact", { emailVerifiedAt: null });
    const disabled = await mkUser("dis", { disabledAt: new Date() });
    const results = await Promise.all([
      call(`${tag}-nobody@example.com`), call(unact.email), call(disabled.email),
    ]);
    for (const r of results) expect(r).toEqual({ status: "sent" });
    expect(await tokenCount(unact.id)).toBe(0);
    expect(await tokenCount(disabled.id)).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops honeypot submissions silently", async () => {
    const u = await mkUser("hp");
    const res = await call(u.email, { company_site: "http://spam.example" });
    expect(res).toEqual({ status: "sent" });
    expect(await tokenCount(u.id)).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rate limits the 6th request from one IP within the window", async () => {
    headerGet.mockReturnValue("7.7.7.7");
    for (let i = 0; i < 5; i++) {
      expect((await call(`${tag}-rl-${i}@example.com`)).status).toBe("sent");
    }
    const sixth = await call(`${tag}-rl-5@example.com`);
    expect(sixth.status).toBe("error");
  });

  it("rejects an empty email with an error (before any lookup)", async () => {
    expect((await call("")).status).toBe("error");
  });
});
```

- [ ] **Step 2: Write the failing completion tests** — `tests/password-reset-confirm.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("6.6.6.6"));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { resetPassword } from "@/app/actions/password-reset";
import { createToken } from "@/lib/auth/tokens";
import { Role, TokenPurpose } from "@prisma/client";

const tag = `pwcnf-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
const call = (token: string, password: string, confirm = password) =>
  resetPassword({ status: "idle" }, fd({ token, password, confirm }));

async function activatedUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${s}@example.com`, name: "T", role: Role.ADMIN, companyId: co.id,
      passwordHash: await bcrypt.hash("old-password-123", 10), emailVerifiedAt: new Date("2026-01-01"),
    },
  });
}

afterAll(async () => {
  const cos = await prisma.company.findMany({ where: { name: { contains: tag } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { companyId: { in: cos.map((c) => c.id) } } });
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: "resetpw:" } } });
  await prisma.$disconnect();
});

describe("resetPassword", () => {
  it("sets the new hash, consumes all reset tokens, audits, redirects — and never touches emailVerifiedAt", async () => {
    const u = await activatedUser("ok");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await createToken(u.id, TokenPurpose.PASSWORD_RESET); // a second outstanding one
    await expect(call(raw, "brand-new-password-1")).rejects.toThrow("REDIRECT:/login?reset=1");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("brand-new-password-1", after.passwordHash!)).toBe(true);
    expect(after.emailVerifiedAt?.toISOString()).toBe(new Date("2026-01-01").toISOString());
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { targetId: u.id, action: "user.password_reset_self" } });
    expect(log).not.toBeNull();
  });

  it("rejects reusing a consumed token", async () => {
    const u = await activatedUser("reuse");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    await expect(call(raw, "brand-new-password-1")).rejects.toThrow("REDIRECT:");
    expect((await call(raw, "another-password-123")).status).toBe("error");
  });

  it("rejects an ACTIVATION token (purpose isolation at the action level)", async () => {
    const u = await activatedUser("purpose");
    const act = await createToken(u.id, TokenPurpose.ACTIVATION);
    expect((await call(act, "brand-new-password-1")).status).toBe("error");
  });

  it("rejects short passwords and mismatched confirmation without consuming the token", async () => {
    const u = await activatedUser("policy");
    const raw = await createToken(u.id, TokenPurpose.PASSWORD_RESET);
    expect((await call(raw, "short")).status).toBe("error");
    expect((await call(raw, "brand-new-password-1", "different-password-1")).status).toBe("error");
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(1);
  });

  it("rejects a garbage token", async () => {
    expect((await call("garbage", "brand-new-password-1")).status).toBe("error");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/password-reset-request.test.ts tests/password-reset-confirm.test.ts`
Expected: FAIL — module `@/app/actions/password-reset` does not exist.

- [ ] **Step 4: Implement** — create `src/app/actions/password-reset.ts`:

```ts
"use server";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendBestEffort } from "@/lib/email";
import { passwordResetLinkEmail } from "@/lib/email/templates";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { createToken, verifyToken, consumeTokens, resetUrl } from "@/lib/auth/tokens";
import { validatePassword } from "@/lib/auth/password-policy";
import { writeAudit } from "@/lib/audit/log";
import { TokenPurpose } from "@prisma/client";

export type ForgotPasswordState = { status: "idle" | "sent" | "error"; message?: string };
export type ResetPasswordState = { status: "idle" | "error"; message?: string };

const NEUTRAL: ForgotPasswordState = { status: "sent" };
const WINDOW_MS = 60 * 60_000;
const REQUEST_MAX = 5;
const RESET_MAX = 10;

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`reset:${ip}`, REQUEST_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  // Honeypot: real users never fill this hidden field.
  if (String(formData.get("company_site") ?? "").trim() !== "") return NEUTRAL;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error", message: "Ingresa tu correo." };

  // Enumeration-safe: unknown, unactivated, or disabled accounts get the same
  // neutral answer and no token. Unactivated users must use their activation link.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.emailVerifiedAt || user.disabledAt) return NEUTRAL;

  const raw = await createToken(user.id, TokenPurpose.PASSWORD_RESET);
  const url = resetUrl(raw);
  // Send after the response, like the requestAccess operator notice: keeps the
  // eligible/ineligible branches at comparable latency and non-blocking.
  after(() => sendBestEffort(passwordResetLinkEmail(user.email, user.name, url)));
  return NEUTRAL;
}

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`resetpw:${ip}`, RESET_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const policy = validatePassword(password);
  if (!policy.ok) return { status: "error", message: policy.error };
  if (password !== confirm) return { status: "error", message: "Las contraseñas no coinciden." };

  const valid = await verifyToken(token, TokenPurpose.PASSWORD_RESET);
  if (!valid) return { status: "error", message: "El enlace es inválido o expiró." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    // Atomically claim THIS token (same race guard as activateAccount).
    const claimed = await tx.verificationToken.updateMany({
      where: { id: valid.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("Token already consumed");
    await consumeTokens(tx, valid.userId, TokenPurpose.PASSWORD_RESET);
    // Deliberately does NOT touch emailVerifiedAt: reset never activates an account.
    const user = await tx.user.update({ where: { id: valid.userId }, data: { passwordHash } });
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "user.password_reset_self",
      targetType: "User",
      targetId: user.id,
      summary: `Password reset via emailed link (${user.email})`,
    });
  });

  redirect("/login?reset=1");
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/password-reset-request.test.ts tests/password-reset-confirm.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/password-reset.ts tests/password-reset-request.test.ts tests/password-reset-confirm.test.ts
git commit -m "feat(auth): self-service password reset actions (enumeration-safe intake + single-use link)"
```

---

### Task 5: Admin reset unification — link instead of temp password

**Files:**
- Modify: `src/app/actions/admin.ts` (`resetUserPassword` + imports)
- Modify: `src/app/app/admin/page.tsx` (banners + cookie constants)
- Modify: `src/i18n/dictionaries.ts` (admin keys)
- Modify: `src/lib/email/templates.ts` (delete `passwordResetEmail`, `userInviteEmail`, `loginLink`)
- Test: rewrite `tests/password-reset.test.ts`; trim `tests/email.test.ts`

**Interfaces:**
- Consumes: `createToken`/`resetUrl` (Task 2), `passwordResetLinkEmail` (Task 3).
- Produces: `resetUserPassword(formData)` keeps its export name/signature (the `ResetPasswordButton` component is untouched). New cookie `r360_reset_sent` (value `"1"`, maxAge 30, path `/app/admin`) flashes the confirmation banner.

- [ ] **Step 1: Rewrite the failing tests** — replace the body of `tests/password-reset.test.ts`. Keep the file's existing mock block, fixtures, and cleanup EXCEPT: give `memberId`/`residentId`/`otherCompanyUserId` fixtures `emailVerifiedAt: new Date()` (the reworked action refuses unactivated targets), add one extra unactivated fixture, add the email mock, and extend cleanup with `prisma.verificationToken.deleteMany({ where: { user: { email: { contains: s-value } } } })` — simplest is to capture the `s` tag in a module-level variable and clean by `contains`. Add to the mock block:

```ts
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
```

New describe body:

```ts
describe("resetUserPassword (link-based)", () => {
  it("mints a PASSWORD_RESET token and emails a /reset/ link — passwordHash is NOT changed", async () => {
    asAdmin();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    await resetUserPassword(fd(memberId));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.verificationToken.count({
      where: { userId: memberId, purpose: "PASSWORD_RESET", consumedAt: null },
    })).toBe(1);
    expect(sendMock).toHaveBeenCalledOnce();
    const msg = sendMock.mock.calls[0][0];
    expect(msg.text).toMatch(/\/reset\//);
    expect(msg.text).not.toMatch(/contraseña temporal/i);
  });

  it("flashes the reset-sent cookie (never a password)", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    expect(cookieSetMock).toHaveBeenCalledOnce();
    const [name, value] = cookieSetMock.mock.calls[0];
    expect(name).toBe("r360_reset_sent");
    expect(value).toBe("1");
  });

  it("writes an audit log row with action user.password_reset", async () => {
    asAdmin();
    await resetUserPassword(fd(memberId));
    const log = await prisma.auditLog.findFirst({
      where: { actorId: adminId, targetId: memberId, action: "user.password_reset" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("refuses an unactivated target (they must use their activation link)", async () => {
    asAdmin();
    await expect(resetUserPassword(fd(unactivatedId))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a non-admin caller (RESIDENT)", async () => {
    asResident();
    await expect(resetUserPassword(fd(memberId))).rejects.toThrow(/Forbidden/i);
  });

  it("rejects a cross-tenant target", async () => {
    asAdmin();
    await expect(resetUserPassword(fd(otherCompanyUserId))).rejects.toThrow(/Forbidden|Not found/i);
  });
});
```

(`unactivatedId` = new fixture in `beforeAll`: same shape as `memberId` but `emailVerifiedAt: null`. `beforeEach` must also reset `sendMock`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/password-reset.test.ts`
Expected: FAIL — action still mints a temp password (hash changes, wrong cookie, no token).

- [ ] **Step 3: Rework the action** — in `src/app/actions/admin.ts` replace `resetUserPassword` and the cookie constant:

Replace `const TEMP_PW_COOKIE = "r360_temp_pw";` with `const RESET_SENT_COOKIE = "r360_reset_sent";` and the whole function with:

```ts
/**
 * Send a company member a single-use password-reset link (2h TTL).
 * ADMIN-only. Tenant-scoped: cannot reset users from another company.
 * Unactivated members are refused — they must use their activation link
 * ("Reenviar invitación") instead. No credential is generated or emailed.
 */
export async function resetUserPassword(formData: FormData) {
  const { id: actorId, companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));

  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target || !target.emailVerifiedAt) throw new Error("Forbidden");

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      companyId,
      actorId,
      action: "user.password_reset",
      targetType: "User",
      targetId: userId,
      summary: `Admin sent password-reset link to ${target.email}`,
    });
  });

  const raw = await createToken(target.id, TokenPurpose.PASSWORD_RESET);
  await sendBestEffort(passwordResetLinkEmail(target.email, target.name, resetUrl(raw)));

  (await cookies()).set(RESET_SENT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/app/admin",
    maxAge: 30,
  });

  redirect("/app/admin");
}
```

Import changes at the top of `admin.ts`:
- Add `createToken, resetUrl` to the existing `@/lib/auth/tokens` import and `TokenPurpose` to the `@prisma/client` import.
- Replace `passwordResetEmail` with `passwordResetLinkEmail` in the `@/lib/email/templates` import.
- Then run `grep -n 'randomBytes\|loginUrl' src/app/actions/admin.ts` — delete the `randomBytes` import and the `loginUrl()` helper **only if** this rework removed their last usage (createUser's invite rework likely already dropped theirs; verify, don't assume). `bcrypt` stays (other actions use it) unless the same grep proves otherwise.

- [ ] **Step 4: Update the admin page** — in `src/app/app/admin/page.tsx`:
- Replace `const TEMP_PW_COOKIE = "r360_temp_pw";` with `const RESET_SENT_COOKIE = "r360_reset_sent";`
- Replace `const temp = (await cookies()).get(TEMP_PW_COOKIE)?.value;` with `const resetSent = (await cookies()).get(RESET_SENT_COOKIE)?.value === "1";`
- Replace the whole `{temp && (...)}` banner block with (same card style as the `inviteSent` banner directly below it):

```tsx
{resetSent && (
  <div className="card" style={{ padding: "14px 18px", marginBottom: 24, borderColor: "var(--line-strong)", display: "flex", alignItems: "center", gap: 12 }}>
    <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
    <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>{A.resetSent}</p>
  </div>
)}
```

- [ ] **Step 5: Update dictionaries** — in `src/i18n/dictionaries.ts` admin section (both languages): delete `tempPre` and `tempPost`; add
  - es: `resetSent: "Enlace de restablecimiento enviado. El usuario recibirá un correo para definir una nueva contraseña.",`
  - en: `resetSent: "Reset link sent. The user will receive an email to set a new password.",`

Run `grep -rn 'tempPre\|tempPost' src/` — expected: no hits remain (the admin page banner was their only consumer).

- [ ] **Step 6: Delete the credential-carrying templates** — in `src/lib/email/templates.ts` delete `passwordResetEmail`, `userInviteEmail`, and the now-orphaned `loginLink` helper. In `tests/email.test.ts` delete the two tests that exercised them ("password reset email carries the temp password…" and "invite email carries user + temp password…") and their imports. Then verify the credential invariant repo-wide:

Run: `grep -rn 'tempPassword\|temp_pw\|Contraseña temporal' src/`
Expected: no hits.

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run tests/password-reset.test.ts tests/email.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors (catches any missed import/dict-key consumer).

- [ ] **Step 8: Commit**

```bash
git add src/app/actions/admin.ts src/app/app/admin/page.tsx src/i18n/dictionaries.ts src/lib/email/templates.ts tests/password-reset.test.ts tests/email.test.ts
git commit -m "feat(auth): admin password reset sends a link — no credential ever leaves the system"
```

---

### Task 6: Public paths + login page entry points

**Files:**
- Modify: `src/auth.config.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/i18n/dictionaries.ts` (login section, both languages)
- Test: `tests/public-paths.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `/forgot-password` and `/reset/*` reachable without a session; login page links to `/forgot-password` and `/request-access`; `t.login.forgot`, `t.login.noAccount`, `t.login.resetDone` in both dictionaries.

- [ ] **Step 1: Write the failing test** — `tests/public-paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

function authorized(pathname: string, hasSession = false): boolean {
  return authConfig.callbacks.authorized({
    auth: hasSession ? ({ user: { id: "u1" } } as never) : null,
    request: { nextUrl: { pathname } } as never,
  }) as boolean;
}

describe("public paths", () => {
  it.each(["/forgot-password", "/reset/some-raw-token", "/request-access", "/activate/x", "/login", "/"])(
    "allows %s without a session",
    (p) => expect(authorized(p)).toBe(true),
  );
  it("still protects /app without a session", () => {
    expect(authorized("/app")).toBe(false);
    expect(authorized("/app", true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/public-paths.test.ts`
Expected: FAIL on `/forgot-password` and `/reset/some-raw-token` (currently `false`).

- [ ] **Step 3: Add the public paths** — in `src/auth.config.ts` extend the `isPublic` expression:

```ts
const isPublic =
  pathname === "/" ||
  pathname.startsWith("/login") ||
  pathname.startsWith("/request-access") ||
  pathname.startsWith("/activate") ||
  pathname.startsWith("/forgot-password") ||
  pathname.startsWith("/reset") ||
  pathname.startsWith("/verify/");
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/public-paths.test.ts`
Expected: PASS

- [ ] **Step 5: Add dictionary keys** — in `src/i18n/dictionaries.ts` `login` section:
  - es: `forgot: "¿Olvidaste tu contraseña?",` · `noAccount: "¿No tienes cuenta? Solicitar acceso",` · `resetDone: "Contraseña actualizada. Inicia sesión.",`
  - en: `forgot: "Forgot your password?",` · `noAccount: "No account? Request access",` · `resetDone: "Password updated. Please sign in.",`

- [ ] **Step 6: Update the login page** — in `src/app/login/page.tsx`:
- Widen the searchParams type: `{ error?: string; activated?: string; reset?: string }` and destructure `reset`.
- After the `{activated && (...)}` block add the reset flash (same green style):

```tsx
{reset && (
  <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.resetDone}</p>
)}
```

- Between the password input and the submit button, add the forgot link (and shrink the password input's `marginBottom` from 18 to 8 so the link sits tight under it):

```tsx
<div style={{ textAlign: "right", marginBottom: 18 }}>
  <Link href="/forgot-password" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>{T.forgot}</Link>
</div>
```

- In the footer bar (the `div` holding the "← back" link), add the request-access link as its right-hand sibling:

```tsx
<Link href="/request-access" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>{T.noAccount}</Link>
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit && npx vitest run tests/public-paths.test.ts`
Expected: clean + PASS.

```bash
git add src/auth.config.ts src/app/login/page.tsx src/i18n/dictionaries.ts tests/public-paths.test.ts
git commit -m "feat(auth): login page links to request-access + forgot-password; public reset paths"
```

---

### Task 7: Pages — `/forgot-password`, `/reset/[token]`, shared password fields

**Files:**
- Create: `src/components/password-fields.tsx`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset/[token]/page.tsx`
- Modify: `src/app/activate/[token]/page.tsx` (use the shared component)

**Interfaces:**
- Consumes: `requestPasswordReset`/`resetPassword` + their state types (Task 4).
- Produces: `PasswordFields` client component: `({ } ) => JSX` rendering the `password` + `confirm` inputs (names fixed — the actions read `formData.get("password")`/`get("confirm")`).

- [ ] **Step 1: Create the shared component** — `src/components/password-fields.tsx`:

```tsx
"use client";

/** The password + confirm pair used by the activate and reset pages.
 *  Field names are contract: server actions read "password" and "confirm".
 *  minLength mirrors MIN_PASSWORD_LENGTH (12) — the server re-validates. */
export function PasswordFields() {
  return (
    <>
      <input name="password" type="password" placeholder="Nueva contraseña" required minLength={12} className="input" style={{ marginBottom: 10 }} autoComplete="new-password" />
      <input name="confirm" type="password" placeholder="Confirmar contraseña" required minLength={12} className="input" style={{ marginBottom: 18 }} autoComplete="new-password" />
    </>
  );
}
```

- [ ] **Step 2: Create the forgot-password page** — `src/app/forgot-password/page.tsx` (mirrors `request-access/page.tsx`):

```tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/password-reset";

const initial: ForgotPasswordState = { status: "idle" };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Restablecer contraseña</h1>
        {state.status === "sent" && (
          <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            Si existe una cuenta con ese correo, enviaremos un enlace para restablecer la contraseña.
          </p>
        )}
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input name="email" type="email" placeholder="Correo" required className="input" style={{ marginBottom: 18 }} autoComplete="email" autoFocus />
        {/* Honeypot: hidden from users, bots fill it. */}
        <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Enviar enlace →"}
        </button>
        <div style={{ marginTop: 14 }}>
          <Link href="/login" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>← Volver a iniciar sesión</Link>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create the reset page** — `src/app/reset/[token]/page.tsx` (mirrors the activate page):

```tsx
"use client";
import { use, useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "@/app/actions/password-reset";
import { PasswordFields } from "@/components/password-fields";

const initial: ResetPasswordState = { status: "idle" };

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Nueva contraseña</h1>
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input type="hidden" name="token" value={token} />
        <PasswordFields />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Guardar contraseña →"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Refactor the activate page** — in `src/app/activate/[token]/page.tsx`, replace its two password `<input>` lines with `<PasswordFields />` and add `import { PasswordFields } from "@/components/password-fields";`. Nothing else changes.

- [ ] **Step 5: Type-check, full suite, live smoke**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

Then verify live against the dev server (`npm run dev` if not already running):
1. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/forgot-password` → `200`
2. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/reset/some-token` → `200`
3. In a browser: `/login` shows both new links; `/forgot-password` submits to the neutral screen; mint a real link with `npx tsx --env-file=.env.local e2e-db-util.tmp.ts mint <activated-email>` — NOTE that util mints ACTIVATION tokens, so instead mint a reset token inline:
   `npx tsx --env-file=.env.local -e "import { createToken, resetUrl } from './src/lib/auth/tokens'; import { prisma } from './src/lib/db'; import { TokenPurpose } from '@prisma/client'; prisma.user.findUniqueOrThrow({ where: { email: 'admin@record360.do' } }).then(async (u) => { console.log(resetUrl(await createToken(u.id, TokenPurpose.PASSWORD_RESET))); await prisma.$disconnect(); })"`
   Open the printed URL, set a 12+ password, land on `/login?reset=1` with the flash, and sign in with the new password. (Afterwards reset `admin@record360.do` back to `demo1234` the same way if you want the demo password preserved.)

- [ ] **Step 6: Commit**

```bash
git add src/components/password-fields.tsx src/app/forgot-password/ src/app/reset/ src/app/activate/
git commit -m "feat(auth): forgot-password + reset pages with shared password fields"
```

---

### Task 8: Domain runbook + env docs + final verification

**Files:**
- Modify: `web/.env.example` (sharpen APP_URL/EMAIL_FROM guidance)
- Create: `docs/deployment-raphel360.md` (repo root docs/)

**Interfaces:** none (docs + verification only).

- [ ] **Step 1: Update `.env.example`** — replace the `APP_URL` line's comment block and the Email section:

```bash
# Public base URL of the deployment (used in emails, QR codes, and absolute links).
# No trailing slash. Production: https://raphel360.com
APP_URL="https://raphel360.com"
```

```bash
# ─── Email (Resend) ─────────────────────────────────────────────────────────
# Used for activation links, password-reset links, and operator notices.
# The sender domain must be VERIFIED in Resend (SPF + DKIM DNS records) first —
# see docs/deployment-raphel360.md. Production sender: no-reply@raphel360.com.
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="Raphel <no-reply@raphel360.com>"
```

- [ ] **Step 2: Write the runbook** — `docs/deployment-raphel360.md`:

```markdown
# raphel360.com — domain + email cutover runbook

One-time production setup. Order matters: email DNS can verify before the app moves.

## 1. Resend — verify the sending domain
1. Resend dashboard → Domains → Add `raphel360.com`.
2. At the DNS host, create the records Resend prescribes (SPF TXT + DKIM CNAMEs/TXT).
3. Wait for the domain to show **Verified**.

## 2. Netlify env (site: raphl-record360)
- `EMAIL_FROM` = `Raphel <no-reply@raphel360.com>`  (requires step 1)
- `APP_URL`    = `https://raphel360.com`
- `RESEND_API_KEY` = the production key (create in Resend if unset)

## 3. Netlify — attach the domain
1. Site settings → Domain management → add `raphel360.com` as the primary domain.
2. Add `www.raphel360.com` as an alias (redirects to primary).
3. Point DNS at Netlify (apex A/ALIAS + www CNAME per Netlify's instructions).
4. Wait for the TLS certificate to provision. HSTS/CSP already ship in `web/netlify.toml`.

## 4. Verify end-to-end (production)
1. Redeploy so the new env vars take effect.
2. Submit a real `/request-access`, approve it as the SUPERADMIN operator, and confirm the
   activation email arrives FROM no-reply@raphel360.com with an https://raphel360.com/activate/… link.
3. On `/login`, use "¿Olvidaste tu contraseña?" and confirm the reset email + link work.
4. DevTools → Network on any page: confirm HSTS, CSP, and X-Frame-Options response headers.
```

- [ ] **Step 3: Final verification**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, lint clean (the jsx-ast-utils "AwaitExpression" warnings are noise), build succeeds and lists `/forgot-password` and `/reset/[token]` in the route table.

- [ ] **Step 4: Commit**

```bash
git add .env.example ../docs/deployment-raphel360.md
git commit -m "docs(deploy): raphel360.com domain + email cutover runbook"
```

---

## Final verification

- [ ] Full suite + lint + build (Task 8 Step 3).
- [ ] Live walkthrough on the dev server: login links → forgot-password neutral screen → minted reset link → new password → `/login?reset=1` flash → sign-in works; admin "Restablecer contraseña" shows the reset-sent banner and the target's password is unchanged until they use the link.
- [ ] `grep -rn 'tempPassword\|Contraseña temporal' src/` → zero hits (credential invariant).
- [ ] Delete `web/e2e-db-util.tmp.ts` before the branch PR (leftover from the E2E run).
- [ ] Ops (human, after merge): execute `docs/deployment-raphel360.md`.

## Spec coverage check

- Login links + reset flash → Task 6.
- `PASSWORD_RESET` purpose + 2h TTL + purpose isolation → Tasks 1, 2.
- Enumeration-safe intake (honeypot, 5/hour/IP, neutral for unknown/unactivated/disabled) → Task 4.
- Single-use reset completion, never touches `emailVerifiedAt`, audited → Task 4.
- Admin reset unified to link; temp-password template + cookie flash removed; credential invariant → Task 5.
- Public paths → Task 6. Pages + shared password fields → Task 7.
- raphel360.com sender + APP_URL + Netlify domain → Task 8 (runbook; ops executes).
- Out of scope confirmed: no session revocation, no changed-password notification email, no 2FA.
