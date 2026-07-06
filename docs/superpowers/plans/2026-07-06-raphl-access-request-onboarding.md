# Access-Request Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a prospective business request access on a public form; a platform SUPERADMIN reviews and approves; approval creates the business's inactive `Company` + first `ADMIN` and emails a single-use one-click activation link that sets their password and lets them in.

**Architecture:** Build on the existing hand-rolled auth (Credentials provider, DB-backed throttle, email abstraction). A new `AccessRequest` captures intake; a new `SUPERADMIN` role gates the operator review screen; the emailed, hashed, expiring `VerificationToken` is the secure entry. Accounts are created inactive (no password, no `emailVerifiedAt`) and cannot log in until the link is used. The existing admin invite (`createUser`) is reworked to use the same activation link, retiring plaintext temp passwords.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + PostgreSQL, next-auth v5 (Credentials), bcryptjs, Node `crypto`, vitest (Node env, real Prisma against the DB in `.env.local`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-raphl-access-request-onboarding-design.md`.
- Password minimum length: **12** characters.
- Activation token TTL: **24h**.
- Tokens: 32-byte CSPRNG, stored as **sha256 hex only**; the raw token exists only in the emailed link. Single-use (`consumedAt`).
- After activation: **redirect to `/login?activated=1`** with a success flash (no auto-login).
- The public request form is **enumeration-safe**: it always returns the same neutral "we'll review" result regardless of whether the email already exists, and never creates a duplicate.
- **No auto-decline email** on reject.
- Operator notification emails go to **all users with role `SUPERADMIN`**.
- No emoji in UI; monochrome/text only (project rule). Icons: monochrome SVG line icons from `@/components/icons` or text.
- UI copy is Spanish-first (`es` default). Spanish strings are the source of truth.
- All new server-side modules live under `web/`. Run every command from `web/` (the package root).
- Tests use real Prisma (`prisma.*`) like `tests/login-throttle.test.ts`; action tests mock `next/headers`, `next/navigation`, `next/cache`, `@/auth`, and `@/lib/email` (see the patterns in each task).
- `passwordHash` becomes nullable — the login path and any `bcrypt.compare` must guard against a null hash.

---

## File Structure

**New files**
- `web/src/lib/auth/tokens.ts` — mint/hash/verify/consume activation tokens; build activation URL.
- `web/src/lib/auth/rate-limit.ts` — generic attempt rate limiter (reuses `LoginAttempt`) + `clientIp`.
- `web/src/lib/auth/password-policy.ts` — password strength validation.
- `web/src/lib/auth/credentials.ts` — testable credential check + activation guard (extracted from `auth.ts`).
- `web/src/lib/auth/operator.ts` — `requireSuperAdmin` guard.
- `web/src/app/actions/access.ts` — `requestAccess`, `approveRequest`, `rejectRequest`, `resendActivation`.
- `web/src/app/actions/activation.ts` — `activateAccount`.
- `web/src/app/request-access/page.tsx` — public intake form.
- `web/src/app/activate/[token]/page.tsx` — set-password / activation page.
- `web/src/app/app/operator/access-requests/page.tsx` — SUPERADMIN review screen.
- Tests: `tests/tokens.test.ts`, `tests/rate-limit.test.ts`, `tests/password-policy.test.ts`, `tests/credentials.test.ts`, `tests/email-activation.test.ts`, `tests/request-access-action.test.ts`, `tests/approve-request-action.test.ts`, `tests/activate-action.test.ts`, `tests/create-user-invite.test.ts`.

**Modified files**
- `web/prisma/schema.prisma` — `Role.SUPERADMIN`; `User.passwordHash?` + `User.emailVerifiedAt` + back-relation; `VerificationToken` + `TokenPurpose`; `AccessRequest` + `RequestStatus`.
- `web/src/auth.ts` — delegate credential check to `credentials.ts`.
- `web/src/auth.config.ts` — add `/request-access`, `/activate` to public paths.
- `web/src/app/actions/admin.ts` — rework `createUser` to activation-link; add `resendInvite`; drop temp-password on create.
- `web/src/app/app/admin/page.tsx` — invite-sent flash + per-user resend; keep temp banner for password reset.
- `web/src/lib/email/templates.ts` — `accountActivationEmail`, `newAccessRequestEmail`.
- `web/src/i18n/dictionaries.ts` — `login.activated` key.
- `web/scripts/create-admin.ts` — optional `ADMIN_ROLE`; password optional on update (enables SUPERADMIN promotion).
- `netlify.toml` — security `[[headers]]` block.

---

## Task 1: Schema — SUPERADMIN, activation tokens, access requests

**Files:**
- Modify: `web/prisma/schema.prisma`
- Test: `tests/tokens.test.ts` (schema smoke test; expanded in Task 2)

**Interfaces:**
- Produces: `Role.SUPERADMIN`; `User.emailVerifiedAt: DateTime?`, `User.passwordHash: String?`, `User.verificationTokens: VerificationToken[]`; models `VerificationToken`, `AccessRequest`; enums `TokenPurpose { ACTIVATION }`, `RequestStatus { PENDING, APPROVED, REJECTED }`.

- [ ] **Step 1: Add `SUPERADMIN` to the `Role` enum** in `web/prisma/schema.prisma`:

```prisma
enum Role {
  SUPERADMIN
  ADMIN
  MANAGER
  SUPERVISOR
  RESIDENT
}
```

- [ ] **Step 2: Edit the `User` model** — make `passwordHash` nullable, add `emailVerifiedAt`, add the back-relation:

```prisma
  email              String              @unique
  passwordHash       String?
  emailVerifiedAt    DateTime?
  name               String
```
and in the relations area of `User` (next to `notifications`, `signatures`):
```prisma
  verificationTokens VerificationToken[]
```

- [ ] **Step 3: Append the new models + enums** at the end of the schema file:

```prisma
enum TokenPurpose {
  ACTIVATION
}

model VerificationToken {
  id         String       @id @default(cuid())
  tokenHash  String       @unique
  purpose    TokenPurpose
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime     @default(now())

  @@index([userId])
}

enum RequestStatus {
  PENDING
  APPROVED
  REJECTED
}

model AccessRequest {
  id               String        @id @default(cuid())
  businessName     String
  contactName      String
  email            String
  phone            String
  website          String?
  message          String?
  status           RequestStatus @default(PENDING)
  reviewedById     String?
  reviewedAt       DateTime?
  createdCompanyId String?
  createdUserId    String?
  createdAt        DateTime      @default(now())

  @@index([status, createdAt])
}
```

- [ ] **Step 4: Create the migration**

Run: `npx prisma migrate dev --name access_request_onboarding`
Expected: migration `*_access_request_onboarding` created and applied; `prisma generate` runs. (Widening `passwordHash` to nullable is safe on existing rows.)

- [ ] **Step 5: Schema smoke test** — create `tests/tokens.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const tag = `schema-smoke-${Date.now()}`;

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: tag } });
  await prisma.$disconnect();
});

describe("access-request schema", () => {
  it("can create and read an AccessRequest with default PENDING status", async () => {
    await prisma.accessRequest.create({
      data: { businessName: "Smoke SRL", contactName: "Smoke", email: tag, phone: "809-000-0000" },
    });
    const found = await prisma.accessRequest.findFirst({ where: { email: tag } });
    expect(found?.status).toBe("PENDING");
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/tokens.test.ts
git commit -m "feat(auth): schema for SUPERADMIN, activation tokens, access requests"
```

---

## Task 2: Token library

**Files:**
- Create: `web/src/lib/auth/tokens.ts`
- Test: `tests/tokens.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 models; `@prisma/client` `TokenPurpose`.
- Produces:
  - `hashToken(raw: string): string`
  - `createActivationToken(userId: string, now?: Date): Promise<string>` (returns the RAW token)
  - `verifyActivationToken(raw: string, now?: Date): Promise<{ id: string; userId: string } | null>`
  - `consumeActivationTokens(tx: Prisma.TransactionClient, userId: string, now?: Date): Promise<void>`
  - `activationUrl(rawToken: string): string`

- [ ] **Step 1: Write the failing tests** — append to `tests/tokens.test.ts`:

```ts
import { createActivationToken, verifyActivationToken, hashToken, activationUrl } from "@/lib/auth/tokens";
import { Role } from "@prisma/client";

async function makeUser(suffix: string) {
  const company = await prisma.company.create({ data: { name: `tok-co-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `tok-${suffix}@example.com`, name: "Tok", role: Role.ADMIN, companyId: company.id },
  });
  return { user, company };
}

describe("activation tokens", () => {
  it("mints a raw token whose sha256 is stored, and verifies it", async () => {
    const { user } = await makeUser(`v-${Date.now()}`);
    const raw = await createActivationToken(user.id);
    const stored = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    expect(stored).not.toBeNull();
    const ok = await verifyActivationToken(raw);
    expect(ok?.userId).toBe(user.id);
  });

  it("rejects expired tokens", async () => {
    const { user } = await makeUser(`x-${Date.now()}`);
    const raw = await createActivationToken(user.id, new Date(Date.now() - 48 * 3600_000));
    expect(await verifyActivationToken(raw)).toBeNull();
  });

  it("builds an absolute activation URL", () => {
    expect(activationUrl("abc")).toMatch(/\/activate\/abc$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tokens`
Expected: FAIL — cannot find module `@/lib/auth/tokens`.

- [ ] **Step 3: Implement** `web/src/lib/auth/tokens.ts`:

```ts
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { TokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint an ACTIVATION token for a user. Returns the RAW token (only time it exists). */
export async function createActivationToken(userId: string, now = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      purpose: TokenPurpose.ACTIVATION,
      userId,
      expiresAt: new Date(now.getTime() + ACTIVATION_TTL_MS),
    },
  });
  return raw;
}

/** Return {id,userId} if the token is valid (exists, ACTIVATION, unexpired, unconsumed), else null. */
export async function verifyActivationToken(
  raw: string,
  now = new Date(),
): Promise<{ id: string; userId: string } | null> {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.purpose !== TokenPurpose.ACTIVATION || row.consumedAt || row.expiresAt <= now) return null;
  return { id: row.id, userId: row.userId };
}

/** Consume all outstanding ACTIVATION tokens for a user (single-use enforcement). */
export async function consumeActivationTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  await tx.verificationToken.updateMany({
    where: { userId, purpose: TokenPurpose.ACTIVATION, consumedAt: null },
    data: { consumedAt: now },
  });
}

/** Absolute activation link. Falls back to localhost in dev so the email always has a link. */
export function activationUrl(rawToken: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/activate/${rawToken}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/tokens.ts tests/tokens.test.ts
git commit -m "feat(auth): activation token mint/verify/consume library"
```

---

## Task 3: Generic rate limiter

**Files:**
- Create: `web/src/lib/auth/rate-limit.ts`
- Test: `tests/rate-limit.test.ts`

**Interfaces:**
- Consumes: `LoginAttempt` model.
- Produces:
  - `rateLimit(key: string, max: number, windowMs: number, now?: Date): Promise<boolean>` — returns `true` when the call **exceeds** `max` within the window.
  - `clientIp(headers: Headers): string`

- [ ] **Step 1: Write the failing test** — `tests/rate-limit.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

const key = `rl-test-${Date.now()}`;
afterAll(async () => { await prisma.loginAttempt.deleteMany({ where: { key } }); await prisma.$disconnect(); });
beforeEach(async () => { await prisma.loginAttempt.deleteMany({ where: { key } }); });

describe("rateLimit", () => {
  it("blocks after exceeding max within the window", async () => {
    for (let i = 0; i < 3; i += 1) expect(await rateLimit(key, 3, 60_000)).toBe(false);
    expect(await rateLimit(key, 3, 60_000)).toBe(true); // 4th call exceeds max=3
  });

  it("resets after the window elapses", async () => {
    const past = new Date(Date.now() - 120_000);
    expect(await rateLimit(key, 1, 60_000, past)).toBe(false);
    expect(await rateLimit(key, 1, 60_000)).toBe(false); // new window
  });
});

describe("clientIp", () => {
  it("prefers x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("1.2.3.4");
  });
  it("falls back to unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rate-limit`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `web/src/lib/auth/rate-limit.ts`:

```ts
import { prisma } from "@/lib/db";

/** Returns true when this call pushes the counter ABOVE `max` within `windowMs`. */
export async function rateLimit(key: string, max: number, windowMs: number, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.loginAttempt.findUnique({ where: { key } });
    if (!row || now.getTime() - row.windowStartedAt.getTime() >= windowMs) {
      await tx.loginAttempt.upsert({
        where: { key },
        create: { key, failures: 1, windowStartedAt: now, lastFailureAt: now },
        update: { failures: 1, windowStartedAt: now, blockedUntil: null, lastFailureAt: now },
      });
      return false;
    }
    const failures = row.failures + 1;
    await tx.loginAttempt.update({ where: { key }, data: { failures, lastFailureAt: now } });
    return failures > max;
  });
}

/** Best-effort client IP from proxy headers (Netlify / Cloudflare). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- rate-limit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/rate-limit.ts tests/rate-limit.test.ts
git commit -m "feat(auth): generic attempt rate limiter + clientIp"
```

---

## Task 4: Password policy

**Files:**
- Create: `web/src/lib/auth/password-policy.ts`
- Test: `tests/password-policy.test.ts`

**Interfaces:**
- Produces: `MIN_PASSWORD_LENGTH: number`; `validatePassword(pw: string): { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test** — `tests/password-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

describe("validatePassword", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validatePassword("short").ok).toBe(false);
  });
  it("accepts passwords at the minimum length", () => {
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- password-policy`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `web/src/lib/auth/password-policy.ts`:

```ts
export const MIN_PASSWORD_LENGTH = 12;

export function validatePassword(pw: string): { ok: true } | { ok: false; error: string } {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- password-policy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password-policy.ts tests/password-policy.test.ts
git commit -m "feat(auth): password strength policy (min 12)"
```

---

## Task 5: Email templates

**Files:**
- Modify: `web/src/lib/email/templates.ts`
- Test: `tests/email-activation.test.ts`

**Interfaces:**
- Consumes: `EmailMessage` from `@/lib/email/types`; the existing `esc` + `APP_NAME` in the file.
- Produces:
  - `accountActivationEmail(to: string, name: string, activationUrl: string): EmailMessage`
  - `AccessRequestSummary` type + `newAccessRequestEmail(to: string, req: AccessRequestSummary, reviewUrl?: string): EmailMessage`

- [ ] **Step 1: Write the failing test** — `tests/email-activation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountActivationEmail, newAccessRequestEmail } from "@/lib/email/templates";

describe("activation + access-request emails", () => {
  it("activation email contains the link and escapes the name", () => {
    const msg = accountActivationEmail("a@b.com", "<b>Ann", "https://x.test/activate/tok");
    expect(msg.to).toBe("a@b.com");
    expect(msg.html).toContain("https://x.test/activate/tok");
    expect(msg.html).not.toContain("<b>Ann");
    expect(msg.text).toContain("https://x.test/activate/tok");
  });

  it("new-access-request email includes the business details for the operator", () => {
    const msg = newAccessRequestEmail(
      "ops@raphel.test",
      { businessName: "Acme SRL", contactName: "Ana", email: "ana@acme.test", phone: "809-555-1212" },
      "https://x.test/app/operator/access-requests",
    );
    expect(msg.html).toContain("Acme SRL");
    expect(msg.html).toContain("ana@acme.test");
    expect(msg.html).toContain("https://x.test/app/operator/access-requests");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- email-activation`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement** — append to `web/src/lib/email/templates.ts` (reuse the existing `esc` + `APP_NAME`):

```ts
/** Sent to a newly created/invited/approved user: a single-use link to set their password. */
export function accountActivationEmail(to: string, name: string, activationUrl: string): EmailMessage {
  return {
    to,
    subject: `${APP_NAME}: activa tu cuenta`,
    text:
      `Hola ${name},\n\n` +
      `Activa tu cuenta en ${APP_NAME} y define tu contraseña con este enlace ` +
      `(válido por 24 horas):\n\n${activationUrl}\n\n` +
      `Si no esperabas este correo, ignóralo.`,
    html:
      `<p>Hola ${esc(name)},</p>` +
      `<p>Activa tu cuenta en <b>${APP_NAME}</b> y define tu contraseña con este enlace ` +
      `(válido por 24 horas):</p>` +
      `<p><a href="${esc(activationUrl)}">Activar mi cuenta</a></p>` +
      `<p>Si no esperabas este correo, ignóralo.</p>`,
  };
}

export type AccessRequestSummary = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string | null;
  message?: string | null;
};

/** Sent to operators when a new access request arrives. */
export function newAccessRequestEmail(to: string, req: AccessRequestSummary, reviewUrl?: string): EmailMessage {
  const rows =
    `Empresa: ${req.businessName}\n` +
    `Contacto: ${req.contactName}\n` +
    `Correo: ${req.email}\n` +
    `Teléfono: ${req.phone}\n` +
    (req.website ? `Sitio: ${req.website}\n` : "") +
    (req.message ? `Mensaje: ${req.message}\n` : "");
  const htmlRows =
    `<li>Empresa: <b>${esc(req.businessName)}</b></li>` +
    `<li>Contacto: ${esc(req.contactName)}</li>` +
    `<li>Correo: ${esc(req.email)}</li>` +
    `<li>Teléfono: ${esc(req.phone)}</li>` +
    (req.website ? `<li>Sitio: ${esc(req.website)}</li>` : "") +
    (req.message ? `<li>Mensaje: ${esc(req.message)}</li>` : "");
  const link = reviewUrl ? `\n\nRevisar: ${reviewUrl}` : "";
  const htmlLink = reviewUrl ? `<p><a href="${esc(reviewUrl)}">Revisar solicitudes</a></p>` : "";
  return {
    to,
    subject: `${APP_NAME}: nueva solicitud de acceso`,
    text: `Nueva solicitud de acceso en ${APP_NAME}.\n\n${rows}${link}`,
    html: `<p>Nueva solicitud de acceso en <b>${APP_NAME}</b>.</p><ul>${htmlRows}</ul>${htmlLink}`,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- email-activation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates.ts tests/email-activation.test.ts
git commit -m "feat(email): activation + new-access-request templates"
```

---

## Task 6: Credential check extraction + activation guard

**Files:**
- Create: `web/src/lib/auth/credentials.ts`
- Modify: `web/src/auth.ts`
- Test: `tests/credentials.test.ts`

**Interfaces:**
- Consumes: `prisma`, `bcryptjs`, `loginThrottleBlocked/Failure/Reset` from `@/lib/auth/login-throttle`.
- Produces: `AuthedUser = { id: string; name: string; email: string; role: Role; companyId: string }`; `verifyCredentials(email: string, password: string, throttleKey?: string | null): Promise<AuthedUser | null>` — returns null for: throttled, missing/disabled user, **no passwordHash or no emailVerifiedAt (unactivated)**, or bad password.

- [ ] **Step 1: Write the failing test** — `tests/credentials.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/credentials";
import { Role } from "@prisma/client";

const tag = `cred-${Date.now()}`;
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

async function user(suffix: string, data: { passwordHash?: string | null; emailVerifiedAt?: Date | null }) {
  const company = await prisma.company.create({ data: { name: `${tag}-${suffix}` } });
  return prisma.user.create({
    data: {
      email: `${tag}-${suffix}@example.com`,
      name: "U",
      role: Role.ADMIN,
      companyId: company.id,
      passwordHash: data.passwordHash ?? null,
      emailVerifiedAt: data.emailVerifiedAt ?? null,
    },
  });
}

describe("verifyCredentials", () => {
  it("rejects an unactivated user (no password, not verified)", async () => {
    const u = await user("pending", {});
    expect(await verifyCredentials(u.email, "whatever12345")).toBeNull();
  });
  it("accepts an activated user with the right password", async () => {
    const hash = await bcrypt.hash("correcthorse123", 10);
    const u = await user("active", { passwordHash: hash, emailVerifiedAt: new Date() });
    expect((await verifyCredentials(u.email, "correcthorse123"))?.id).toBe(u.id);
  });
  it("rejects the wrong password", async () => {
    const hash = await bcrypt.hash("correcthorse123", 10);
    const u = await user("wrong", { passwordHash: hash, emailVerifiedAt: new Date() });
    expect(await verifyCredentials(u.email, "nope12345678")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- credentials`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `web/src/lib/auth/credentials.ts`:

```ts
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loginThrottleBlocked, loginThrottleFailure, loginThrottleReset } from "@/lib/auth/login-throttle";

export type AuthedUser = { id: string; name: string; email: string; role: Role; companyId: string };

/** Returns the user on success, else null. Null cases are intentionally indistinguishable. */
export async function verifyCredentials(
  email: string,
  password: string,
  throttleKey?: string | null,
): Promise<AuthedUser | null> {
  if (throttleKey && (await loginThrottleBlocked(throttleKey))) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  const fail = async () => { if (throttleKey) await loginThrottleFailure(throttleKey); return null; };

  if (!user || user.disabledAt) return fail();
  if (!user.passwordHash || !user.emailVerifiedAt) return fail(); // unactivated
  if (!(await bcrypt.compare(password, user.passwordHash))) return fail();

  if (throttleKey) await loginThrottleReset(throttleKey);
  return { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- credentials`
Expected: PASS.

- [ ] **Step 5: Rewire `web/src/auth.ts`** — replace the whole file with:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { loginThrottleKey } from "@/lib/auth/login-throttle";
import { verifyCredentials } from "@/lib/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const key = request ? loginThrottleKey(email, request) : null;
        return verifyCredentials(email, password, key);
      },
    }),
  ],
});
```

- [ ] **Step 6: Verify the suite still passes + build**

Run: `npm test -- credentials login-throttle && npm run build`
Expected: PASS; build succeeds (confirms `auth.ts` types are intact).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/credentials.ts src/auth.ts tests/credentials.test.ts
git commit -m "feat(auth): extract verifyCredentials + block unactivated logins"
```

---

## Task 7: Operator guard (`requireSuperAdmin`)

**Files:**
- Create: `web/src/lib/auth/operator.ts`

**Interfaces:**
- Consumes: `requireFreshSession` + `FreshSessionUser` from `@/lib/auth/session`; `Role`.
- Produces: `requireSuperAdmin(): Promise<FreshSessionUser>` — throws `Error("Forbidden")` unless the fresh session user's role is `SUPERADMIN`.

- [ ] **Step 1: Implement** `web/src/lib/auth/operator.ts`:

```ts
import { Role } from "@prisma/client";
import { requireFreshSession, type FreshSessionUser } from "@/lib/auth/session";

/** Require a signed-in platform operator (SUPERADMIN). Re-reads role from the DB (fresh). */
export async function requireSuperAdmin(): Promise<FreshSessionUser> {
  const user = await requireFreshSession();
  if (user.role !== Role.SUPERADMIN) throw new Error("Forbidden");
  return user;
}
```

- [ ] **Step 2: Typecheck via build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/operator.ts
git commit -m "feat(auth): requireSuperAdmin operator guard"
```

(No dedicated unit test — the guard is exercised through the operator-action tests in Task 9, which create a real SUPERADMIN and a non-operator.)

---

## Task 8: `requestAccess` action (public intake)

**Files:**
- Create: `web/src/app/actions/access.ts` (this task adds `requestAccess` only)
- Test: `tests/request-access-action.test.ts`

**Interfaces:**
- Consumes: `rateLimit`, `clientIp`, `mailer`/`sendBestEffort`, `newAccessRequestEmail`, `prisma`.
- Produces: `type RequestAccessState = { status: "idle" | "sent" | "error"; message?: string }`; `requestAccess(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState>`. Form fields: `business`, `name`, `email`, `phone`, `website` (optional), `message` (optional), `company_site` (honeypot).

- [ ] **Step 1: Write the failing test** — `tests/request-access-action.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendMock = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("9.9.9.9"));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { requestAccess } from "@/app/actions/access";

const tag = `rq-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(() => sendMock.mockReset());
afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: "request:" } } });
  await prisma.$disconnect();
});

describe("requestAccess", () => {
  it("creates a PENDING request on valid input", async () => {
    const email = `${tag}-ok@x.com`;
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Acme`, name: "Ana", email, phone: "809-1" }));
    expect(res.status).toBe("sent");
    const row = await prisma.accessRequest.findFirst({ where: { email } });
    expect(row?.status).toBe("PENDING");
  });

  it("errors on missing required fields, creating nothing", async () => {
    const res = await requestAccess({ status: "idle" }, fd({ business: "", name: "", email: "", phone: "" }));
    expect(res.status).toBe("error");
  });

  it("is enumeration-safe: an existing account returns 'sent' and creates no request", async () => {
    const email = `${tag}-dup@x.com`;
    const co = await prisma.company.create({ data: { name: `${tag}-dupco` } });
    await prisma.user.create({ data: { email, name: "D", role: "ADMIN", companyId: co.id } });
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Should`, name: "D", email, phone: "809-2" }));
    expect(res.status).toBe("sent");
    expect(await prisma.accessRequest.findFirst({ where: { email } })).toBeNull();
  });

  it("silently ignores honeypot submissions", async () => {
    const email = `${tag}-hp@x.com`;
    const res = await requestAccess({ status: "idle" }, fd({ business: `${tag}-Hp`, name: "H", email, phone: "809-3", company_site: "bot" }));
    expect(res.status).toBe("sent");
    expect(await prisma.accessRequest.findFirst({ where: { email } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- request-access-action`
Expected: FAIL — cannot find module `@/app/actions/access`.

- [ ] **Step 3: Implement** `web/src/app/actions/access.ts`:

```ts
"use server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { sendBestEffort } from "@/lib/email";
import { newAccessRequestEmail } from "@/lib/email/templates";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { Role } from "@prisma/client";

export type RequestAccessState = { status: "idle" | "sent" | "error"; message?: string };

const NEUTRAL: RequestAccessState = { status: "sent" };
const WINDOW_MS = 60 * 60_000;
const MAX_PER_IP = 10;

function reviewUrl(): string | undefined {
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}/app/operator/access-requests` : undefined;
}

export async function requestAccess(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`request:${ip}`, MAX_PER_IP, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  // Honeypot: real users never fill this hidden field.
  if (String(formData.get("company_site") ?? "").trim() !== "") return NEUTRAL;

  const businessName = String(formData.get("business") ?? "").trim();
  const contactName = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim() || null;

  if (!businessName || !contactName || !email || !phone) {
    return { status: "error", message: "Completa los campos obligatorios." };
  }

  // Enumeration-safe: if the email already has an account or a pending request,
  // show the same neutral screen and create no duplicate.
  const [existingUser, existingRequest] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.accessRequest.findFirst({ where: { email, status: "PENDING" } }),
  ]);
  if (existingUser || existingRequest) return NEUTRAL;

  await prisma.accessRequest.create({
    data: { businessName, contactName, email, phone, website, message },
  });

  // Notify operators (best-effort — never blocks the neutral result).
  const operators = await prisma.user.findMany({ where: { role: Role.SUPERADMIN, disabledAt: null }, select: { email: true } });
  await Promise.all(
    operators.map((op) =>
      sendBestEffort(newAccessRequestEmail(op.email, { businessName, contactName, email, phone, website, message }, reviewUrl())),
    ),
  );

  return NEUTRAL;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- request-access-action`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/access.ts tests/request-access-action.test.ts
git commit -m "feat(auth): requestAccess public intake action (enumeration-safe)"
```

---

## Task 9: `approveRequest` / `rejectRequest` / `resendActivation` (operator actions)

**Files:**
- Modify: `web/src/app/actions/access.ts` (add three actions)
- Test: `tests/approve-request-action.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `createActivationToken`, `activationUrl`, `accountActivationEmail`, `mailer`, `writeAudit`, `revalidatePath`, `prisma`.
- Produces: `approveRequest(formData: FormData): Promise<void>`, `rejectRequest(formData: FormData): Promise<void>`, `resendActivation(formData: FormData): Promise<void>` (all take `requestId`; all SUPERADMIN-only).

- [ ] **Step 1: Write the failing test** — `tests/approve-request-action.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { approveRequest, rejectRequest } from "@/app/actions/access";

const tag = `ap-${Date.now()}`;
let operatorId = "";
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(async () => {
  sendMock.mockReset();
  const co = await prisma.company.create({ data: { name: `${tag}-ops-${Math.random()}` } });
  const op = await prisma.user.create({
    data: { email: `${tag}-op-${Math.random()}@x.com`, name: "Op", role: Role.SUPERADMIN, companyId: co.id, passwordHash: "x", emailVerifiedAt: new Date() },
  });
  operatorId = op.id;
  authMock.mockResolvedValue({ user: { id: operatorId, companyId: co.id, role: Role.SUPERADMIN } });
});
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.accessRequest.deleteMany({ where: { email: { contains: tag } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

describe("approveRequest", () => {
  it("creates an inactive company + admin, mints a token, emails activation, marks APPROVED", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Acme`, contactName: "Ana", email: `${tag}-ana@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    const created = await prisma.user.findUnique({ where: { email: `${tag}-ana@x.com` } });
    expect(created?.role).toBe("ADMIN");
    expect(created?.passwordHash).toBeNull();
    expect(created?.emailVerifiedAt).toBeNull();
    expect(await prisma.verificationToken.count({ where: { userId: created!.id } })).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const after = await prisma.accessRequest.findUnique({ where: { id: req.id } });
    expect(after?.status).toBe("APPROVED");
    expect(after?.createdUserId).toBe(created!.id);
  });

  it("does not create a duplicate when the email already has an account", async () => {
    const co = await prisma.company.create({ data: { name: `${tag}-existingco` } });
    await prisma.user.create({ data: { email: `${tag}-dup@x.com`, name: "D", role: Role.ADMIN, companyId: co.id, passwordHash: "x", emailVerifiedAt: new Date() } });
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-DupBiz`, contactName: "D", email: `${tag}-dup@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    expect(await prisma.company.findFirst({ where: { name: `${tag}-DupBiz` } })).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    expect((await prisma.accessRequest.findUnique({ where: { id: req.id } }))?.status).toBe("APPROVED");
  });

  it("is idempotent: a second approve of the same request does nothing", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Once`, contactName: "O", email: `${tag}-once@x.com`, phone: "809" } });
    await approveRequest(fd({ requestId: req.id }));
    sendMock.mockReset();
    await approveRequest(fd({ requestId: req.id }));
    expect(sendMock).not.toHaveBeenCalled();
    expect(await prisma.company.count({ where: { name: `${tag}-Once` } })).toBe(1);
  });

  it("rejects a non-operator", async () => {
    authMock.mockResolvedValueOnce({ user: { id: operatorId, companyId: "x", role: Role.ADMIN } });
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-No`, contactName: "N", email: `${tag}-no@x.com`, phone: "809" } });
    await expect(approveRequest(fd({ requestId: req.id }))).rejects.toThrow();
  });
});

describe("rejectRequest", () => {
  it("marks the request REJECTED and sends no email", async () => {
    const req = await prisma.accessRequest.create({ data: { businessName: `${tag}-Rej`, contactName: "R", email: `${tag}-rej@x.com`, phone: "809" } });
    await rejectRequest(fd({ requestId: req.id }));
    expect((await prisma.accessRequest.findUnique({ where: { id: req.id } }))?.status).toBe("REJECTED");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- approve-request-action`
Expected: FAIL — `approveRequest`/`rejectRequest` not exported.

- [ ] **Step 3: Implement** — add to `web/src/app/actions/access.ts` (new imports + three actions):

```ts
import { revalidatePath } from "next/cache";
import { mailer } from "@/lib/email";
import { accountActivationEmail } from "@/lib/email/templates";
import { createActivationToken, activationUrl } from "@/lib/auth/tokens";
import { requireSuperAdmin } from "@/lib/auth/operator";
import { writeAudit } from "@/lib/audit/log";

const OPERATOR_PATH = "/app/operator/access-requests";

export async function approveRequest(formData: FormData): Promise<void> {
  const operator = await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));

  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") { revalidatePath(OPERATOR_PATH); return; } // idempotent no-op

  // If the email already has an account, resolve the request without creating a duplicate.
  const existing = await prisma.user.findUnique({ where: { email: req.email } });
  if (existing) {
    await prisma.accessRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", reviewedById: operator.id, reviewedAt: new Date() },
    });
    revalidatePath(OPERATOR_PATH);
    return;
  }

  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: req.businessName } });
    const created = await tx.user.create({
      data: { email: req.email, name: req.contactName, role: Role.ADMIN, companyId: company.id },
    });
    await tx.accessRequest.update({
      where: { id: req.id },
      data: {
        status: "APPROVED",
        reviewedById: operator.id,
        reviewedAt: new Date(),
        createdCompanyId: company.id,
        createdUserId: created.id,
      },
    });
    await writeAudit(tx, {
      companyId: company.id,
      actorId: operator.id,
      action: "access_request.approved",
      targetType: "Company",
      targetId: company.id,
      summary: `Approved access request for ${req.businessName} (${req.email})`,
    });
    return created;
  });

  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(req.email, req.contactName, activationUrl(raw)));
  revalidatePath(OPERATOR_PATH);
}

export async function rejectRequest(formData: FormData): Promise<void> {
  const operator = await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));
  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") { revalidatePath(OPERATOR_PATH); return; }
  await prisma.accessRequest.update({
    where: { id: req.id },
    data: { status: "REJECTED", reviewedById: operator.id, reviewedAt: new Date() },
  });
  revalidatePath(OPERATOR_PATH);
}

/** Re-mint + re-send the activation link for an approved request whose user is still unactivated. */
export async function resendActivation(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));
  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "APPROVED" || !req.createdUserId) { revalidatePath(OPERATOR_PATH); return; }
  const user = await prisma.user.findUnique({ where: { id: req.createdUserId } });
  if (!user || user.emailVerifiedAt) { revalidatePath(OPERATOR_PATH); return; } // already activated
  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(user.email, user.name, activationUrl(raw)));
  revalidatePath(OPERATOR_PATH);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- approve-request-action`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/access.ts tests/approve-request-action.test.ts
git commit -m "feat(auth): operator approve/reject/resend access-request actions"
```

---

## Task 10: `activateAccount` action

**Files:**
- Create: `web/src/app/actions/activation.ts`
- Test: `tests/activate-action.test.ts`

**Interfaces:**
- Consumes: `verifyActivationToken`, `consumeActivationTokens`, `validatePassword`, `rateLimit`, `clientIp`, `bcryptjs`, `writeAudit`, `redirect`.
- Produces: `type ActivateState = { status: "idle" | "error"; message?: string }`; `activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState>`. Fields: `token`, `password`, `confirm`. On success calls `redirect("/login?activated=1")` (throws internally — does not return).

- [ ] **Step 1: Write the failing test** — `tests/activate-action.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("8.8.8.8"));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { activateAccount } from "@/app/actions/activation";
import { createActivationToken } from "@/lib/auth/tokens";
import { Role } from "@prisma/client";

const tag = `act-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
async function pendingUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({ data: { email: `${tag}-${s}@x.com`, name: "P", role: Role.ADMIN, companyId: co.id } });
}
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: "activate:" } } });
  await prisma.$disconnect();
});

describe("activateAccount", () => {
  it("sets password + emailVerifiedAt, consumes token, redirects to login", async () => {
    const u = await pendingUser("ok");
    const raw = await createActivationToken(u.id);
    await expect(activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "longpassword12" })))
      .rejects.toThrow("REDIRECT:/login?activated=1");
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.emailVerifiedAt).not.toBeNull();
    expect(await bcrypt.compare("longpassword12", after!.passwordHash!)).toBe(true);
    expect(await prisma.verificationToken.count({ where: { userId: u.id, consumedAt: null } })).toBe(0);
  });

  it("rejects a short password", async () => {
    const u = await pendingUser("short");
    const raw = await createActivationToken(u.id);
    expect((await activateAccount({ status: "idle" }, fd({ token: raw, password: "short", confirm: "short" }))).status).toBe("error");
  });

  it("rejects mismatched confirmation", async () => {
    const u = await pendingUser("mm");
    const raw = await createActivationToken(u.id);
    expect((await activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "different12345" }))).status).toBe("error");
  });

  it("rejects an invalid token", async () => {
    expect((await activateAccount({ status: "idle" }, fd({ token: "garbage", password: "longpassword12", confirm: "longpassword12" }))).status).toBe("error");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- activate-action`
Expected: FAIL — cannot find module `@/app/actions/activation`.

- [ ] **Step 3: Implement** `web/src/app/actions/activation.ts`:

```ts
"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { verifyActivationToken, consumeActivationTokens } from "@/lib/auth/tokens";
import { validatePassword } from "@/lib/auth/password-policy";
import { writeAudit } from "@/lib/audit/log";

export type ActivateState = { status: "idle" | "error"; message?: string };
const WINDOW_MS = 60 * 60_000;
const ACTIVATE_MAX = 10;

export async function activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`activate:${ip}`, ACTIVATE_MAX, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const policy = validatePassword(password);
  if (!policy.ok) return { status: "error", message: policy.error };
  if (password !== confirm) return { status: "error", message: "Las contraseñas no coinciden." };

  const valid = await verifyActivationToken(token);
  if (!valid) return { status: "error", message: "El enlace es inválido o expiró." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: valid.userId },
      data: { passwordHash, emailVerifiedAt: new Date() },
    });
    await consumeActivationTokens(tx, valid.userId);
    await writeAudit(tx, {
      companyId: user.companyId,
      actorId: user.id,
      action: "user.activated",
      targetType: "User",
      targetId: user.id,
      summary: `Account activated (${user.email})`,
    });
  });

  redirect("/login?activated=1");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- activate-action`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/activation.ts tests/activate-action.test.ts
git commit -m "feat(auth): activateAccount action (set password + verify email)"
```

---

## Task 11: `createUser` rework + `resendInvite` + admin page

**Files:**
- Modify: `web/src/app/actions/admin.ts` (`createUser`; add `resendInvite`)
- Modify: `web/src/app/app/admin/page.tsx`
- Test: `tests/create-user-invite.test.ts`

**Interfaces:**
- Consumes: `createActivationToken`, `activationUrl`, `accountActivationEmail`, `mailer`, `requireSession`.
- Produces: `createUser(formData: FormData): Promise<void>` (no longer returns a password); `resendInvite(formData: FormData): Promise<void>` (field `userId`; ADMIN-only, tenant-scoped, only for unactivated users).

- [ ] **Step 1: Write the failing test** — `tests/create-user-invite.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock }, sendBestEffort: sendMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { createUser } from "@/app/actions/admin";

const tag = `inv-${Date.now()}`;
let companyId = "";
let adminId = "";
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(async () => {
  sendMock.mockReset();
  const co = await prisma.company.create({ data: { name: `${tag}-co-${Math.random()}` } });
  companyId = co.id;
  const admin = await prisma.user.create({ data: { email: `${tag}-admin-${Math.random()}@x.com`, name: "A", role: Role.ADMIN, companyId, passwordHash: "x", emailVerifiedAt: new Date() } });
  adminId = admin.id;
  authMock.mockResolvedValue({ user: { id: adminId, companyId, role: Role.ADMIN } });
});
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { user: { email: { contains: tag } } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.$disconnect();
});

describe("createUser (invite via activation link)", () => {
  it("creates an inactive user and emails an activation link, no password", async () => {
    await createUser(fd({ name: "New", email: `${tag}-new@x.com`, role: "RESIDENT" }));
    const u = await prisma.user.findUnique({ where: { email: `${tag}-new@x.com` } });
    expect(u?.passwordHash).toBeNull();
    expect(u?.emailVerifiedAt).toBeNull();
    expect(await prisma.verificationToken.count({ where: { userId: u!.id } })).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- create-user-invite`
Expected: FAIL — `createUser` still sets a `passwordHash` and returns a temp password, so the null assertions fail.

- [ ] **Step 3: Fix imports in `web/src/app/actions/admin.ts`** — add near the other imports:

```ts
import { mailer } from "@/lib/email";
import { accountActivationEmail } from "@/lib/email/templates";
import { createActivationToken, activationUrl } from "@/lib/auth/tokens";
```
Keep the existing `passwordResetEmail` import and `randomBytes`/`sendBestEffort` — `resetUserPassword` still uses them.

- [ ] **Step 4: Rewrite `createUser`** in `web/src/app/actions/admin.ts` (replace the body at lines ~222-250):

```ts
export async function createUser(formData: FormData) {
  // Minting users (incl. ADMINs) is ADMIN-only — stricter than other admin actions.
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const submitted = String(formData.get("role"));
  if (!Object.values(Role).includes(submitted as Role)) throw new Error("Invalid role");

  const email = String(formData.get("email")).trim().toLowerCase();
  const name = String(formData.get("name")).trim();

  // Inactive user: no password, not verified. They activate via the emailed link.
  const user = await prisma.user.create({
    data: { email, name, role: submitted as Role, companyId },
  });

  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(email, name, activationUrl(raw)));
  revalidatePath("/app/admin");
}
```

- [ ] **Step 5: Add `resendInvite`** below `createUser` in the same file:

```ts
export async function resendInvite(formData: FormData) {
  const { companyId, role } = await requireSession();
  if (role !== Role.ADMIN) throw new Error("Forbidden");

  const userId = String(formData.get("userId"));
  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("Forbidden");
  if (target.emailVerifiedAt) throw new Error("Already activated"); // only pending users

  const raw = await createActivationToken(target.id);
  await mailer.send(accountActivationEmail(target.email, target.name, activationUrl(raw)));
  revalidatePath("/app/admin");
}
```

- [ ] **Step 6: Run to verify pass + build**

Run: `npm test -- create-user-invite password-reset && npm run build`
Expected: tests PASS. The **build FAILS** here because `web/src/app/app/admin/page.tsx` still reads a return value from `createUser` (`const tempPassword = await createUser(...)`). Fixed in the next steps.

- [ ] **Step 7: Update the admin page** `web/src/app/app/admin/page.tsx`

Add an invite-sent cookie constant near the existing `TEMP_PW_COOKIE` (line ~16):
```ts
const INVITE_SENT_COOKIE = "r360_invite_sent";
```
Add the `resendInvite` import to the existing admin-actions import (line ~6):
```ts
import { createUser, resendInvite } from "@/app/actions/admin";
```
Replace the `addUser` wrapper (lines ~78-88) — `createUser` no longer returns a password:
```ts
  async function addUser(formData: FormData) {
    "use server";
    await createUser(formData);
    (await cookies()).set(INVITE_SENT_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/app/admin", maxAge: 30 });
    redirect("/app/admin");
  }
```
Read the flash next to the existing `temp` read (line ~76):
```ts
  const inviteSent = (await cookies()).get(INVITE_SENT_COOKIE)?.value === "1";
```
Add an invite-sent banner immediately after the existing `{temp && (...)}` block (after line ~128). (The temp banner stays — it still serves `resetUserPassword`.)
```tsx
      {inviteSent && (
        <div className="card" style={{ padding: "14px 18px", marginBottom: 24, borderColor: "var(--line-strong)", display: "flex", alignItems: "center", gap: 12 }}>
          <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>Invitación enviada. El usuario recibirá un enlace para activar su cuenta.</p>
        </div>
      )}
```

- [ ] **Step 8: Add a per-user "resend" affordance** for unactivated members. Inside the member card, next to the `ResetPasswordButton` block (line ~170-176), add:
```tsx
              {user.role === "ADMIN" && !u.emailVerifiedAt && (
                <form action={resendInvite}>
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.7rem" }}>Reenviar invitación</SubmitButton>
                </form>
              )}
```

- [ ] **Step 9: Build to verify the page compiles**

Run: `npm run build`
Expected: build succeeds — no references to a returned password from `createUser`.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/admin.ts src/app/app/admin/page.tsx tests/create-user-invite.test.ts
git commit -m "feat(auth): invite users via activation link (drop plaintext temp password)"
```

---

## Task 12: Public paths + login `activated` flash

**Files:**
- Modify: `web/src/auth.config.ts`
- Modify: `web/src/app/login/page.tsx`
- Modify: `web/src/i18n/dictionaries.ts`

- [ ] **Step 1: Add public paths** in `web/src/auth.config.ts` — change the `isPublic` line (line ~16):

```ts
      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/request-access") ||
        pathname.startsWith("/activate") ||
        pathname.startsWith("/verify/");
```

- [ ] **Step 2: Add the `activated` i18n key** in `web/src/i18n/dictionaries.ts`

In the `es` `login` block (line ~44-52), add after `back`:
```ts
      activated: "Cuenta activada. Inicia sesión.",
```
In the `en` `login` block (line ~400-408), add after `back`:
```ts
      activated: "Account activated. Please sign in.",
```

- [ ] **Step 3: Render the flash** in `web/src/app/login/page.tsx`

Change the `searchParams` type + read (lines 8-9):
```ts
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; activated?: string }> }) {
  const { error, activated } = await searchParams;
```
After the existing `{error && (...)}` block (line ~46), add:
```tsx
            {activated && (
              <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.activated}</p>
            )}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/auth.config.ts src/app/login/page.tsx src/i18n/dictionaries.ts
git commit -m "feat(auth): public request-access/activate paths + login activated flash"
```

---

## Task 13: UI pages — request-access, activate, operator review

**Files:**
- Create: `web/src/app/request-access/page.tsx`
- Create: `web/src/app/activate/[token]/page.tsx`
- Create: `web/src/app/app/operator/access-requests/page.tsx`

**Interfaces:**
- Consumes: `requestAccess`/`RequestAccessState`, `activateAccount`/`ActivateState`, `approveRequest`/`rejectRequest`/`resendActivation`, `requireSuperAdmin`, `prisma`, `useActionState`.
- Produces: the three reachable pages wired to the actions.

- [ ] **Step 1: Create the public request page** `web/src/app/request-access/page.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestAccess, type RequestAccessState } from "@/app/actions/access";

const initial: RequestAccessState = { status: "idle" };

export default function RequestAccessPage() {
  const [state, action, pending] = useActionState(requestAccess, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 420, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Solicitar acceso</h1>
        {state.status === "sent" && (
          <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            Gracias. Revisaremos tu solicitud y te contactaremos por correo.
          </p>
        )}
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input name="business" placeholder="Nombre de la empresa" required className="input" style={{ marginBottom: 10 }} />
        <input name="name" placeholder="Tu nombre" required className="input" style={{ marginBottom: 10 }} />
        <input name="email" type="email" placeholder="Correo" required className="input" style={{ marginBottom: 10 }} autoComplete="email" />
        <input name="phone" placeholder="Teléfono" required className="input" style={{ marginBottom: 10 }} />
        <input name="website" placeholder="Sitio web o red social (opcional)" className="input" style={{ marginBottom: 10 }} />
        <textarea name="message" placeholder="Cuéntanos sobre tu empresa (opcional)" className="input" style={{ marginBottom: 18, minHeight: 72 }} />
        {/* Honeypot: hidden from users, bots fill it. */}
        <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Enviar solicitud →"}
        </button>
        <div style={{ marginTop: 14 }}>
          <Link href="/login" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>¿Ya tienes cuenta? Inicia sesión</Link>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create the activate page** `web/src/app/activate/[token]/page.tsx`:

```tsx
"use client";
import { use, useActionState } from "react";
import { activateAccount, type ActivateState } from "@/app/actions/activation";

const initial: ActivateState = { status: "idle" };

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action, pending] = useActionState(activateAccount, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Define tu contraseña</h1>
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input type="hidden" name="token" value={token} />
        <input name="password" type="password" placeholder="Nueva contraseña" required minLength={12} className="input" style={{ marginBottom: 10 }} autoComplete="new-password" />
        <input name="confirm" type="password" placeholder="Confirmar contraseña" required minLength={12} className="input" style={{ marginBottom: 18 }} autoComplete="new-password" />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Activar cuenta →"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create the operator review page** `web/src/app/app/operator/access-requests/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/operator";
import { approveRequest, rejectRequest, resendActivation } from "@/app/actions/access";
import { SubmitButton } from "@/components/submit-button";

export default async function AccessRequestsPage() {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/app");
  }

  const pending = await prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const resolved = await prisma.accessRequest.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 25 });

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="dash-header">
        <div>
          <div className="kicker">OPERADOR</div>
          <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "6px 0 0" }}>Solicitudes de acceso</h1>
        </div>
        <span className="counter">{pending.length} pendientes</span>
      </div>

      {pending.length === 0 && (
        <p className="mono text-steel" style={{ fontSize: "0.8rem" }}>No hay solicitudes pendientes.</p>
      )}

      {pending.map((r) => (
        <div key={r.id} className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>{r.businessName}</div>
          <div className="mono text-steel" style={{ fontSize: "0.74rem", marginTop: 4 }}>
            {r.contactName} · {r.email} · {r.phone}
            {r.website ? ` · ${r.website}` : ""}
          </div>
          {r.message && <p style={{ fontSize: "0.82rem", margin: "8px 0 0" }}>{r.message}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <form action={approveRequest}>
              <input type="hidden" name="requestId" value={r.id} />
              <SubmitButton className="btn btn-accent">Aprobar</SubmitButton>
            </form>
            <form action={rejectRequest}>
              <input type="hidden" name="requestId" value={r.id} />
              <SubmitButton className="btn btn-ghost">Rechazar</SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <div className="team-section" style={{ marginTop: 24 }}>
          <div className="team-section-head">Historial</div>
          {resolved.map((r) => (
            <div key={r.id} className="member-card">
              <div className="member-info">
                <div className="member-name">{r.businessName}</div>
                <div className="member-email">{r.email} — {r.status}</div>
              </div>
              {r.status === "APPROVED" && r.createdUserId && (
                <form action={resendActivation}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.7rem" }}>Reenviar enlace</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build + lint to verify the pages compile**

Run: `npm run build && npm run lint`
Expected: build + lint succeed.

- [ ] **Step 5: Commit**

```bash
git add src/app/request-access/page.tsx "src/app/activate/[token]/page.tsx" src/app/app/operator/access-requests/page.tsx
git commit -m "feat(auth): request-access, activate, and operator review pages"
```

---

## Task 14: SUPERADMIN promotion via `create-admin.ts`

**Files:**
- Modify: `web/scripts/create-admin.ts`

**Interfaces:**
- Produces: an `ADMIN_ROLE` env var (validated against `Role`, default `ADMIN`); on **update** of an existing user, name/company/password are optional (only the role/name/password actually provided are changed) so an existing account can be promoted without resetting its password.

- [ ] **Step 1: Replace `web/scripts/create-admin.ts`** with the role-aware version:

```ts
/**
 * Provision or update a user directly in the database.
 *
 *   ADMIN_EMAIL     required  e.g. acv20207@gmail.com (stored lowercased)
 *   ADMIN_ROLE      optional  one of SUPERADMIN|ADMIN|MANAGER|SUPERVISOR|RESIDENT (default ADMIN)
 *   ADMIN_NAME      required on create; optional on update
 *   ADMIN_COMPANY   required on create; ignored on update
 *   ADMIN_PASSWORD  required on create; optional on update (omit to keep current password)
 *
 * Run against whatever DATABASE_URL is in the environment:
 *   ADMIN_EMAIL=... ADMIN_ROLE=SUPERADMIN npx tsx scripts/create-admin.ts   # promote existing user
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return value;
}

async function main() {
  const email = required("ADMIN_EMAIL").toLowerCase();
  const roleRaw = process.env.ADMIN_ROLE?.trim() || "ADMIN";
  if (!Object.values(Role).includes(roleRaw as Role)) {
    console.error(`Invalid ADMIN_ROLE: ${roleRaw}. Use one of ${Object.values(Role).join(", ")}.`);
    process.exit(1);
  }
  const role = roleRaw as Role;
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (password && password.length < 8) { console.error("ADMIN_PASSWORD must be at least 8 characters."); process.exit(1); }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const data: { role: Role; disabledAt: null; name?: string; passwordHash?: string } = { role, disabledAt: null };
    if (process.env.ADMIN_NAME?.trim()) data.name = process.env.ADMIN_NAME.trim();
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { email }, data });
    console.log(`Done. Updated ${user.email} → role ${user.role}.`);
    return;
  }

  // Create path: name + company + password all required.
  const name = required("ADMIN_NAME");
  const companyName = required("ADMIN_COMPANY");
  if (!password) { console.error("ADMIN_PASSWORD is required to create a new user."); process.exit(1); }
  const passwordHash = await bcrypt.hash(password, 10);
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  const user = await prisma.user.create({ data: { email, name, role, companyId: company.id, passwordHash, emailVerifiedAt: new Date() } });
  console.log(`Done. Created ${user.email} (role ${user.role}) in company "${company.name}".`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
```

Note: the create path now also sets `emailVerifiedAt` so a directly-provisioned account can log in immediately (it never goes through the activation link).

- [ ] **Step 2: Smoke-run against the dev DB** (promote a throwaway, then a real one is done at deploy time):

Run:
```bash
ADMIN_EMAIL=smoke-superadmin@example.com ADMIN_NAME="Smoke" ADMIN_COMPANY="Smoke Co" ADMIN_PASSWORD="smoke12345678" ADMIN_ROLE=SUPERADMIN npx tsx scripts/create-admin.ts
ADMIN_EMAIL=smoke-superadmin@example.com ADMIN_ROLE=ADMIN npx tsx scripts/create-admin.ts
```
Expected: first prints "Created … role SUPERADMIN"; second prints "Updated … role ADMIN" (proving promotion without a password works).

- [ ] **Step 3: Commit**

```bash
git add scripts/create-admin.ts
git commit -m "feat(auth): create-admin.ts supports ADMIN_ROLE + password-less promotion"
```

---

## Task 15: Security headers in `netlify.toml`

**Files:**
- Modify: `netlify.toml` (repo root)

**Interfaces:**
- Produces: a global `[[headers]]` block applying HSTS, CSP, anti-clickjacking, and related headers to all routes.

- [ ] **Step 1: Add the headers block** at the end of `netlify.toml`:

```toml
# Global security headers. X-Frame-Options=DENY blocks clickjacking of the auth
# forms; HSTS forces HTTPS; CSP is the baseline (tighten script/style sources
# after verifying against a deploy preview).
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(self), microphone=(), geolocation=(self), interest-cohort=()"
    Content-Security-Policy = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
```
Note: `camera`/`geolocation` are `self` because the app captures field photos with GPS. `script-src 'unsafe-inline'` is a pragmatic Next.js baseline; a nonce-based CSP is a follow-up.

- [ ] **Step 2: Validate the toml + build**

Run: `npm run build`
Expected: build succeeds (the headers block doesn't affect the build; this confirms nothing regressed).

- [ ] **Step 3: Verify on a deploy preview**

After pushing the branch, open the deploy-preview URL, and in DevTools → Network confirm the document response carries the headers above and that pages, the PWA manifest, and field photo/GPS capture still load (CSP didn't break them). Tighten `script-src` only after this check.

- [ ] **Step 4: Commit**

```bash
git add ../netlify.toml
git commit -m "feat(security): baseline security headers (HSTS, CSP, X-Frame-Options)"
```

---

## Final verification

- [ ] Run the full suite: `npm test`
- [ ] Lint + build: `npm run lint && npm run build`
- [ ] **Promote your real operator account** (run once against production, with the prod `DATABASE_URL` exported):
  `ADMIN_EMAIL=gamaleguista@gmail.com ADMIN_ROLE=SUPERADMIN npx tsx scripts/create-admin.ts`
- [ ] Manual end-to-end (local, reading the `LogMailer` console for links if no `RESEND_API_KEY`):
  1. Visit `/request-access`, submit business + name + email + phone → neutral "we'll review" screen.
  2. As the SUPERADMIN, open `/app/operator/access-requests` → see the pending request → **Aprobar**.
  3. Open the activation link from the email/log → set a 12+ char password → redirected to `/login?activated=1`.
  4. Sign in → reach `/app` as that company's ADMIN.
  5. **Reject** path: submit another request, **Rechazar** it → it moves to Historial as REJECTED, no email sent.
  6. As an in-company ADMIN, add a user in `/app/admin` → "Invitación enviada" banner; the invited user activates via their link; "Reenviar invitación" re-sends while they're pending.
  7. Confirm an un-activated account cannot log in.

## Spec coverage check

- Public request intake (enumeration-safe, honeypot, rate-limited) → Tasks 8, 13.
- SUPERADMIN role + operator gating → Tasks 1, 7, 9, 13, 14.
- Approve → inactive Company+ADMIN + activation link; idempotent; email-exists edge → Task 9.
- Reject (no email) → Task 9.
- Operator resend → Tasks 9, 13.
- Shared activation (set password + verify, single-use, TTL) → Tasks 2, 10, 13.
- Login guard for unactivated accounts → Task 6.
- `createUser` rework + `resendInvite` (drop plaintext temp password) → Task 11.
- Public paths + login flash → Task 12.
- Emails (activation + operator notice) → Task 5; production `RESEND_API_KEY`+`EMAIL_FROM` already configured (operational).
- Security headers → Task 15.
- Schema (SUPERADMIN, nullable passwordHash, emailVerifiedAt, VerificationToken, AccessRequest) → Task 1.
```
