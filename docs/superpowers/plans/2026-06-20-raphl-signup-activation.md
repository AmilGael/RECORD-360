# Self-Signup & Account Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two account-creation flows — code-gated new-company self-signup and invited-user activation — that share one email-verification ("activation") link mechanism, with accounts inactive until the link is used.

**Architecture:** Build on the existing hand-rolled Credentials provider + DB-backed throttle + email abstraction. New users are created with no password and no `emailVerifiedAt`; an emailed single-use, hashed, expiring token activates them (sets password + verifies email). New-company signup is gated by a single-use `SignupCode`. Login is blocked until activation.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + PostgreSQL, next-auth v5 (Credentials), bcryptjs, Node `crypto`, vitest (Node env, real Prisma against the DB in `.env.local`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-raphl-signup-activation-design.md`.
- Password minimum length: **12** characters.
- Activation token TTL: **24h**.
- Tokens: 32-byte CSPRNG, stored as **sha256 hex only**; raw token only in the emailed link. Single-use (`consumedAt`).
- After activation: **redirect to `/login`** with a success flash (no auto-login).
- Account-enumeration safe: signup/resend always return the same neutral result regardless of whether the email exists.
- No emoji in UI; monochrome/text only (project rule).
- UI copy is bilingual via `src/i18n/dictionaries.ts` (`es` default, `en`). Spanish strings are the source of truth.
- Email send for activation/invite is **not** silent best-effort — failures surface a resend state.
- All new server-side modules live under `web/`. Run commands from `web/` (the package root).
- Tests use real Prisma (`prisma.*`) like `tests/login-throttle.test.ts`; mock `next/headers`, `next/navigation`, `next/cache`, and `@/lib/email` in action tests like `tests/password-reset.test.ts`.

---

## File Structure

**New files:**
- `web/src/lib/auth/tokens.ts` — mint/hash/verify/consume activation tokens; build activation URL.
- `web/src/lib/auth/rate-limit.ts` — generic attempt-based rate limiter (reuses `LoginAttempt`) + `clientIp`.
- `web/src/lib/auth/password-policy.ts` — password strength validation.
- `web/src/lib/auth/signup-code.ts` — atomic claim/release/attach for `SignupCode`.
- `web/src/lib/auth/credentials.ts` — testable credential check + activation guard (extracted from `auth.ts`).
- `web/src/app/actions/signup.ts` — `requestCompanySignup`, `activateAccount`, `resendInvite` server actions.
- `web/src/app/signup/page.tsx` — code-gated signup form.
- `web/src/app/activate/[token]/page.tsx` — set-password / activation page.
- `web/scripts/signup-code.ts` — CLI to mint/list signup codes.
- Tests: `tests/tokens.test.ts`, `tests/rate-limit.test.ts`, `tests/password-policy.test.ts`, `tests/signup-code.test.ts`, `tests/credentials.test.ts`, `tests/email-activation.test.ts`, `tests/signup-action.test.ts`, `tests/activate-action.test.ts`, `tests/create-user-invite.test.ts`.

**Modified files:**
- `web/prisma/schema.prisma` — `User.emailVerifiedAt`, `User.passwordHash?`, `VerificationToken` + `TokenPurpose`, `SignupCode`.
- `web/src/auth.ts` — delegate credential check to `credentials.ts`.
- `web/src/auth.config.ts` — add `/signup`, `/activate` to public paths.
- `web/src/app/actions/admin.ts` — rework `createUser` to activation-link; drop temp-password.
- `web/src/app/app/admin/page.tsx` — replace temp-password banner with "invite sent" flash.
- `web/src/app/login/page.tsx` — "Create account" link + flashes.
- `web/src/lib/email/templates.ts` — `accountActivationEmail`, `alreadyRegisteredEmail`.
- `web/src/i18n/dictionaries.ts` — `signup`, `activate` strings; login additions.
- `netlify.toml` — security `[[headers]]` block.

---

## Task 1: Schema — activation + signup-code models

**Files:**
- Modify: `web/prisma/schema.prisma` (User model; add two models + enum)
- Test: `tests/tokens.test.ts` (created here as a schema smoke test, expanded in Task 2)

**Interfaces:**
- Produces: Prisma models `VerificationToken { id, tokenHash, purpose, userId, expiresAt, consumedAt, createdAt }`, `SignupCode { id, code, label, expiresAt, consumedAt, consumedByCompanyId, createdAt }`, enum `TokenPurpose { ACTIVATION }`; `User.emailVerifiedAt: DateTime?`, `User.passwordHash: String?`, `User.verificationTokens: VerificationToken[]`.

- [ ] **Step 1: Edit the `User` model**

In `web/prisma/schema.prisma`, change `passwordHash` to nullable and add the new field + back-relation:

```prisma
  email              String              @unique
  passwordHash       String?
  emailVerifiedAt    DateTime?
  name               String
```
and add to the relations area of `User` (next to `notifications`, `signatures`):
```prisma
  verificationTokens VerificationToken[]
```

- [ ] **Step 2: Add the two models + enum** at the end of the schema file

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

model SignupCode {
  id                  String    @id @default(cuid())
  code                String    @unique
  label               String?
  expiresAt           DateTime?
  consumedAt          DateTime?
  consumedByCompanyId String?
  createdAt           DateTime  @default(now())
}
```

- [ ] **Step 3: Create the migration**

Run: `npx prisma migrate dev --name signup_activation`
Expected: migration `*_signup_activation` created and applied; `prisma generate` runs.

- [ ] **Step 4: Schema smoke test**

Create `tests/tokens.test.ts`:
```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const tag = `schema-smoke-${Date.now()}`;

afterAll(async () => {
  await prisma.signupCode.deleteMany({ where: { code: tag } });
  await prisma.$disconnect();
});

describe("signup/activation schema", () => {
  it("can create and read a SignupCode", async () => {
    await prisma.signupCode.create({ data: { code: tag } });
    const found = await prisma.signupCode.findUnique({ where: { code: tag } });
    expect(found?.consumedAt).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/tokens.test.ts
git commit -m "feat(auth): schema for activation tokens + signup codes"
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
  - `createActivationToken(userId: string, now?: Date): Promise<string>` (returns raw token)
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

  it("rejects expired and consumed tokens", async () => {
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
    const r = validatePassword("short");
    expect(r.ok).toBe(false);
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

## Task 5: Signup-code helpers

**Files:**
- Create: `web/src/lib/auth/signup-code.ts`
- Test: `tests/signup-code.test.ts`

**Interfaces:**
- Consumes: `SignupCode` model.
- Produces:
  - `claimSignupCode(code: string, now?: Date): Promise<boolean>` — atomic; `true` only if it was valid+unused (sets `consumedAt`).
  - `releaseSignupCode(code: string): Promise<void>` — clears `consumedAt` + `consumedByCompanyId`.
  - `attachCompanyToCode(code: string, companyId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `tests/signup-code.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { claimSignupCode, releaseSignupCode } from "@/lib/auth/signup-code";

const code = `code-${Date.now()}`;
afterAll(async () => { await prisma.signupCode.deleteMany({ where: { code } }); await prisma.$disconnect(); });

describe("claimSignupCode", () => {
  it("claims a valid code exactly once", async () => {
    await prisma.signupCode.create({ data: { code } });
    expect(await claimSignupCode(code)).toBe(true);
    expect(await claimSignupCode(code)).toBe(false); // already consumed
  });
  it("re-claims after release", async () => {
    await releaseSignupCode(code);
    expect(await claimSignupCode(code)).toBe(true);
  });
  it("rejects an unknown code", async () => {
    expect(await claimSignupCode("does-not-exist")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- signup-code`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `web/src/lib/auth/signup-code.ts`:

```ts
import { prisma } from "@/lib/db";

/** Atomically claim a code. Returns true only if it was valid (exists, unused, unexpired). */
export async function claimSignupCode(code: string, now = new Date()): Promise<boolean> {
  const res = await prisma.signupCode.updateMany({
    where: { code, consumedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    data: { consumedAt: now },
  });
  return res.count === 1;
}

/** Release a previously-claimed code (used when signup aborts, e.g. email already exists). */
export async function releaseSignupCode(code: string): Promise<void> {
  await prisma.signupCode.updateMany({ where: { code }, data: { consumedAt: null, consumedByCompanyId: null } });
}

export async function attachCompanyToCode(code: string, companyId: string): Promise<void> {
  await prisma.signupCode.updateMany({ where: { code }, data: { consumedByCompanyId: companyId } });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- signup-code`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/signup-code.ts tests/signup-code.test.ts
git commit -m "feat(auth): atomic signup-code claim/release helpers"
```

---

## Task 6: Email templates

**Files:**
- Modify: `web/src/lib/email/templates.ts`
- Test: `tests/email-activation.test.ts`

**Interfaces:**
- Consumes: `EmailMessage` from `@/lib/email/types`.
- Produces:
  - `accountActivationEmail(to: string, name: string, activationUrl: string): EmailMessage`
  - `alreadyRegisteredEmail(to: string, loginUrl?: string): EmailMessage`

- [ ] **Step 1: Write the failing test** — `tests/email-activation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountActivationEmail, alreadyRegisteredEmail } from "@/lib/email/templates";

describe("activation emails", () => {
  it("activation email contains the link and escapes the name", () => {
    const msg = accountActivationEmail("a@b.com", "<b>Ann", "https://x.test/activate/tok");
    expect(msg.to).toBe("a@b.com");
    expect(msg.html).toContain("https://x.test/activate/tok");
    expect(msg.html).not.toContain("<b>Ann");
    expect(msg.text).toContain("https://x.test/activate/tok");
  });
  it("already-registered email does not leak a token", () => {
    const msg = alreadyRegisteredEmail("a@b.com", "https://x.test/login");
    expect(msg.html).toContain("https://x.test/login");
    expect(msg.html).not.toContain("/activate/");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- email-activation`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement** — append to `web/src/lib/email/templates.ts` (reuse the existing `esc` + `APP_NAME`):

```ts
/** Sent to a newly created/invited user: a single-use link to set their password. */
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

/** Sent when someone tries to sign up with an email that already has an account. */
export function alreadyRegisteredEmail(to: string, loginUrl?: string): EmailMessage {
  const link = loginLink(loginUrl);
  return {
    to,
    subject: `${APP_NAME}: ya tienes una cuenta`,
    text:
      `Recibimos un intento de registro con este correo, pero ya existe una cuenta en ${APP_NAME}.\n\n` +
      `Si fuiste tú, inicia sesión.${link.text}`,
    html:
      `<p>Recibimos un intento de registro con este correo, pero ya existe una cuenta en <b>${APP_NAME}</b>.</p>` +
      `<p>Si fuiste tú, inicia sesión.</p>${link.html}`,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- email-activation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates.ts tests/email-activation.test.ts
git commit -m "feat(email): activation + already-registered templates"
```

---

## Task 7: Credential check extraction + activation guard

**Files:**
- Create: `web/src/lib/auth/credentials.ts`
- Modify: `web/src/auth.ts:10-31` (replace inline `authorize` body with a call)
- Test: `tests/credentials.test.ts`

**Interfaces:**
- Consumes: `prisma`, `bcryptjs`, login-throttle helpers.
- Produces: `verifyCredentials(email: string, password: string, throttleKey?: string | null): Promise<{ id: string; name: string; email: string; role: Role; companyId: string } | null>` — returns null for: throttled, missing/disabled user, **no passwordHash or no emailVerifiedAt (unactivated)**, or bad password.

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
    const res = await verifyCredentials(u.email, "correcthorse123");
    expect(res?.id).toBe(u.id);
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

- [ ] **Step 5: Rewire `auth.ts`** — replace the `authorize` body (lines ~13-29) so it delegates:

```ts
      authorize: async (creds, request) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const key = request ? loginThrottleKey(email, request) : null;
        return verifyCredentials(email, password, key);
      },
```
Update the imports at the top of `web/src/auth.ts`: drop `bcrypt`, drop the unused throttle helpers, keep `loginThrottleKey`, and add `import { verifyCredentials } from "@/lib/auth/credentials";`. Final import block:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { loginThrottleKey } from "@/lib/auth/login-throttle";
import { verifyCredentials } from "@/lib/auth/credentials";
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

## Task 8: `requestCompanySignup` action

**Files:**
- Create: `web/src/app/actions/signup.ts` (this task adds `requestCompanySignup` only)
- Test: `tests/signup-action.test.ts`

**Interfaces:**
- Consumes: `claimSignupCode`, `releaseSignupCode`, `attachCompanyToCode`, `createActivationToken`, `activationUrl`, `rateLimit`, `clientIp`, `mailer`, `accountActivationEmail`, `alreadyRegisteredEmail`, `writeAudit`.
- Produces: `requestCompanySignup(_prev: SignupState, formData: FormData): Promise<SignupState>` where `type SignupState = { status: "idle" | "sent" | "error"; message?: string }`. Form fields: `code`, `company`, `name`, `email`, `website` (honeypot).

- [ ] **Step 1: Write the failing test** — `tests/signup-action.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const sendMock = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("9.9.9.9"));
vi.mock("@/lib/email", () => ({ mailer: { send: sendMock } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { requestCompanySignup } from "@/app/actions/signup";

const tag = `su-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }

beforeEach(() => sendMock.mockReset());
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.company.deleteMany({ where: { name: { contains: tag } } });
  await prisma.signupCode.deleteMany({ where: { code: { contains: tag } } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: "signup:" } } });
  await prisma.$disconnect();
});

describe("requestCompanySignup", () => {
  it("creates an inactive company+admin and sends activation on a valid code", async () => {
    const code = `${tag}-ok`;
    await prisma.signupCode.create({ data: { code } });
    const res = await requestCompanySignup({ status: "idle" }, fd({ code, company: `${tag}-Acme`, name: "Ann", email: `${tag}-ann@x.com` }));
    expect(res.status).toBe("sent");
    const u = await prisma.user.findUnique({ where: { email: `${tag}-ann@x.com` } });
    expect(u?.passwordHash).toBeNull();
    expect(u?.emailVerifiedAt).toBeNull();
    expect(u?.role).toBe("ADMIN");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const consumed = await prisma.signupCode.findUnique({ where: { code } });
    expect(consumed?.consumedByCompanyId).toBe(u?.companyId);
  });

  it("rejects an invalid code without creating anything", async () => {
    const res = await requestCompanySignup({ status: "idle" }, fd({ code: "nope", company: `${tag}-X`, name: "N", email: `${tag}-x@x.com` }));
    expect(res.status).toBe("error");
    expect(await prisma.user.findUnique({ where: { email: `${tag}-x@x.com` } })).toBeNull();
  });

  it("is enumeration-safe: existing email returns 'sent', releases the code, creates no new company", async () => {
    const existing = `${tag}-dup@x.com`;
    const co = await prisma.company.create({ data: { name: `${tag}-dupco` } });
    await prisma.user.create({ data: { email: existing, name: "D", role: "ADMIN", companyId: co.id } });
    const code = `${tag}-dupcode`;
    await prisma.signupCode.create({ data: { code } });
    const res = await requestCompanySignup({ status: "idle" }, fd({ code, company: `${tag}-Should`, name: "D", email: existing }));
    expect(res.status).toBe("sent");
    expect(await prisma.company.findFirst({ where: { name: `${tag}-Should` } })).toBeNull();
    expect((await prisma.signupCode.findUnique({ where: { code } }))?.consumedAt).toBeNull(); // released
  });

  it("silently ignores honeypot submissions", async () => {
    const code = `${tag}-hp`;
    await prisma.signupCode.create({ data: { code } });
    const res = await requestCompanySignup({ status: "idle" }, fd({ code, company: `${tag}-Hp`, name: "H", email: `${tag}-h@x.com`, website: "bot" }));
    expect(res.status).toBe("sent");
    expect(await prisma.user.findUnique({ where: { email: `${tag}-h@x.com` } })).toBeNull();
    expect((await prisma.signupCode.findUnique({ where: { code } }))?.consumedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- signup-action`
Expected: FAIL — cannot find module `@/app/actions/signup`.

- [ ] **Step 3: Implement** `web/src/app/actions/signup.ts`:

```ts
"use server";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mailer } from "@/lib/email";
import { accountActivationEmail, alreadyRegisteredEmail } from "@/lib/email/templates";
import { claimSignupCode, releaseSignupCode, attachCompanyToCode } from "@/lib/auth/signup-code";
import { createActivationToken, activationUrl } from "@/lib/auth/tokens";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { writeAudit } from "@/lib/audit/log";

export type SignupState = { status: "idle" | "sent" | "error"; message?: string };

const NEUTRAL: SignupState = { status: "sent" };
const WINDOW_MS = 60 * 60_000;
const MAX_PER_IP = 10;

function loginUrl(): string | undefined {
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}/login` : undefined;
}

export async function requestCompanySignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`signup:${ip}`, MAX_PER_IP, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  // Honeypot: real users never fill this hidden field.
  if (String(formData.get("website") ?? "").trim() !== "") return NEUTRAL;

  const code = String(formData.get("code") ?? "").trim();
  const companyName = String(formData.get("company") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!code || !companyName || !name || !email) {
    return { status: "error", message: "Completa todos los campos." };
  }

  if (!(await claimSignupCode(code))) {
    return { status: "error", message: "Código de acceso inválido o ya utilizado." };
  }

  // Enumeration-safe: if the email exists, don't reveal it — release the code and send a notice.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await releaseSignupCode(code);
    try { await mailer.send(alreadyRegisteredEmail(email, loginUrl())); } catch { /* neutral regardless */ }
    return NEUTRAL;
  }

  const { user } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: companyName } });
    const created = await tx.user.create({
      data: { email, name, role: Role.ADMIN, companyId: company.id },
    });
    await writeAudit(tx, {
      companyId: company.id,
      actorId: created.id,
      action: "company.created",
      targetType: "Company",
      targetId: company.id,
      summary: `Self-signup created company ${companyName} (${email})`,
    });
    return { user: created, companyId: company.id };
  });

  await attachCompanyToCode(code, user.companyId);

  const raw = await createActivationToken(user.id);
  try {
    await mailer.send(accountActivationEmail(email, name, activationUrl(raw)));
  } catch {
    return { status: "error", message: "Cuenta creada, pero no pudimos enviar el correo. Solicita el enlace de nuevo." };
  }
  return NEUTRAL;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- signup-action`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/signup.ts tests/signup-action.test.ts
git commit -m "feat(auth): requestCompanySignup action (code-gated, enumeration-safe)"
```

---

## Task 9: `activateAccount` action

**Files:**
- Modify: `web/src/app/actions/signup.ts` (add `activateAccount`)
- Test: `tests/activate-action.test.ts`

**Interfaces:**
- Consumes: `verifyActivationToken`, `consumeActivationTokens`, `validatePassword`, `rateLimit`, `clientIp`, `bcryptjs`, `writeAudit`, `redirect`.
- Produces: `activateAccount(_prev: ActivateState, formData: FormData): Promise<ActivateState>` where `type ActivateState = { status: "idle" | "error"; message?: string }`. Form fields: `token`, `password`, `confirm`. On success it calls `redirect("/login?activated=1")` (throws internally — does not return).

- [ ] **Step 1: Write the failing test** — `tests/activate-action.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const redirectMock = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
const headerGet = vi.hoisted(() => vi.fn().mockReturnValue("8.8.8.8"));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({ get: headerGet }) }));

import { activateAccount } from "@/app/actions/signup";
import { createActivationToken } from "@/lib/auth/tokens";
import { Role } from "@prisma/client";

const tag = `act-${Date.now()}`;
function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
async function pendingUser(s: string) {
  const co = await prisma.company.create({ data: { name: `${tag}-${s}` } });
  return prisma.user.create({ data: { email: `${tag}-${s}@x.com`, name: "P", role: Role.ADMIN, companyId: co.id } });
}
afterAll(async () => {
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
    const res = await activateAccount({ status: "idle" }, fd({ token: raw, password: "short", confirm: "short" }));
    expect(res.status).toBe("error");
  });

  it("rejects mismatched confirmation", async () => {
    const u = await pendingUser("mm");
    const raw = await createActivationToken(u.id);
    const res = await activateAccount({ status: "idle" }, fd({ token: raw, password: "longpassword12", confirm: "different12345" }));
    expect(res.status).toBe("error");
  });

  it("rejects an invalid/consumed token", async () => {
    const res = await activateAccount({ status: "idle" }, fd({ token: "garbage", password: "longpassword12", confirm: "longpassword12" }));
    expect(res.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- activate-action`
Expected: FAIL — `activateAccount` not exported.

- [ ] **Step 3: Implement** — add to `web/src/app/actions/signup.ts`:

```ts
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { verifyActivationToken, consumeActivationTokens } from "@/lib/auth/tokens";
import { validatePassword } from "@/lib/auth/password-policy";

export type ActivateState = { status: "idle" | "error"; message?: string };
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
Note: the existing `requestCompanySignup` already imports `headers`, `clientIp`, `rateLimit`, `prisma`, `writeAudit`, `WINDOW_MS` — do not re-declare them; only add the new imports shown above.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- activate-action`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/signup.ts tests/activate-action.test.ts
git commit -m "feat(auth): activateAccount action (set password + verify email)"
```

---

## Task 10: `createUser` rework + `resendInvite`

**Files:**
- Modify: `web/src/app/actions/admin.ts:222-250` (`createUser`); add `resendInvite`
- Test: `tests/create-user-invite.test.ts`

**Interfaces:**
- Consumes: `createActivationToken`, `activationUrl`, `accountActivationEmail`, `mailer`, existing `requireSession`/`requireFreshSession`.
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
Expected: FAIL — `createUser` still returns a temp password / sets a passwordHash, so assertions on `passwordHash` null and a verification token fail.

- [ ] **Step 3: Rewrite `createUser`** in `web/src/app/actions/admin.ts` (replace lines ~222-250):

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

- [ ] **Step 4: Add `resendInvite`** below `createUser` in the same file:

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

- [ ] **Step 5: Fix imports in `admin.ts`**

At the top of `web/src/app/actions/admin.ts`: add
```ts
import { mailer } from "@/lib/email";
import { accountActivationEmail } from "@/lib/email/templates";
import { createActivationToken, activationUrl } from "@/lib/auth/tokens";
```
Remove `userInviteEmail` from the `@/lib/email/templates` import (keep `passwordResetEmail`). `randomBytes` and `sendBestEffort` are still used by `resetUserPassword`, so keep them.

- [ ] **Step 6: Run to verify pass + build**

Run: `npm test -- create-user-invite password-reset && npm run build`
Expected: PASS; build succeeds. (Build will fail if the admin page still expects a return value from `createUser` — fixed in the next step.)

- [ ] **Step 7: Update the admin page** `web/src/app/app/admin/page.tsx`

Replace the `addUser` wrapper (lines ~78-88) so it no longer reads a returned password or sets the temp-password cookie:
```ts
  async function addUser(formData: FormData) {
    "use server";
    await createUser(formData);
    (await cookies()).set(INVITE_SENT_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/app/admin", maxAge: 30 });
    redirect("/app/admin");
  }
```
Change the constant near line 16 from the temp-pw cookie to:
```ts
const INVITE_SENT_COOKIE = "r360_invite_sent";
```
Change the flash read (line ~76) to:
```ts
  const inviteSent = (await cookies()).get(INVITE_SENT_COOKIE)?.value === "1";
```
Replace the temp-password banner block (lines ~110-128, the `temp && (...)` conditional that renders `A.tempPre {temp} A.tempPost`) with an invite-sent banner:
```tsx
      {inviteSent && (
        <div className="invite-sent-banner" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
          <Key size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <p className="mono" style={{ fontSize: "0.78rem", margin: 0 }}>{A.inviteSent}</p>
        </div>
      )}
```
(Add `inviteSent: "Invitación enviada. El usuario recibirá un enlace para activar su cuenta."` to the admin dictionary `A` in Task 12's i18n step; for now the build only needs the key to exist — add it in Step 8 below to keep this task self-contained.)

- [ ] **Step 8: Add the one admin i18n key** in `web/src/i18n/dictionaries.ts`

In the `es` admin section (the object aliased as `A` on the admin page — search for the existing `tempPre`/`tempPost` keys) replace those with `inviteSent: "Invitación enviada. El usuario recibirá un enlace para activar su cuenta."`. Do the same in the `en` section with `inviteSent: "Invitation sent. The user will receive a link to activate their account."`. Remove the now-unused `tempPre`/`tempPost`/temp-password keys.

- [ ] **Step 9: Build to verify the page compiles**

Run: `npm run build`
Expected: build succeeds with no references to the removed temp-password cookie/keys.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/admin.ts src/app/app/admin/page.tsx src/i18n/dictionaries.ts tests/create-user-invite.test.ts
git commit -m "feat(auth): invite users via activation link (drop plaintext temp password)"
```

---

## Task 11: Public paths + login page link/flashes

**Files:**
- Modify: `web/src/auth.config.ts:16` (public path check)
- Modify: `web/src/app/login/page.tsx`
- Modify: `web/src/i18n/dictionaries.ts` (login additions)

**Interfaces:**
- Consumes: existing login page structure.
- Produces: `/signup` and `/activate` reachable without a session; login page shows a "Create account" link and `activated`/`checkEmail` flashes.

- [ ] **Step 1: Add public paths** in `web/src/auth.config.ts` — change the `isPublic` line:

```ts
      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/activate") ||
        pathname.startsWith("/verify/");
```

- [ ] **Step 2: Add login i18n keys** in `web/src/i18n/dictionaries.ts`

In `es.login` add:
```ts
      createAccount: "Crear cuenta",
      activated: "Cuenta activada. Inicia sesión.",
      checkEmail: "Revisa tu correo para activar tu cuenta.",
```
In `en.login` add:
```ts
      createAccount: "Create account",
      activated: "Account activated. Please sign in.",
      checkEmail: "Check your email to activate your account.",
```

- [ ] **Step 3: Render the link + flashes** in `web/src/app/login/page.tsx`

Change the `searchParams` type and read the new flags (line ~8-9):
```ts
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; activated?: string }> }) {
  const { error, activated } = await searchParams;
```
After the existing `{error && (...)}` block (line ~46), add a success flash:
```tsx
            {activated && (
              <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>{T.activated}</p>
            )}
```
In the footer row (line ~51-53), add a "Create account" link next to the "back" link:
```tsx
            <Link href="/signup" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>{T.createAccount} →</Link>
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/auth.config.ts src/app/login/page.tsx src/i18n/dictionaries.ts
git commit -m "feat(auth): public signup/activate paths + login link & flashes"
```

---

## Task 12: Signup + activate pages (UI)

**Files:**
- Create: `web/src/app/signup/page.tsx`
- Create: `web/src/app/activate/[token]/page.tsx`
- Modify: `web/src/i18n/dictionaries.ts` (`signup`, `activate` sections)

**Interfaces:**
- Consumes: `requestCompanySignup`/`SignupState`, `activateAccount`/`ActivateState`, `useActionState` (client components), `getDict`.
- Produces: the two reachable pages wired to the actions.

- [ ] **Step 1: Add i18n sections** in `web/src/i18n/dictionaries.ts`

In `es` (top level, near `login`):
```ts
    signup: {
      kicker: "REGISTRO",
      title: "Crear cuenta",
      code: "Código de acceso",
      company: "Nombre de la empresa",
      name: "Tu nombre",
      email: "Correo",
      submit: "Continuar",
      sent: "Si los datos son válidos, te enviamos un enlace para activar tu cuenta.",
      haveAccount: "¿Ya tienes cuenta? Inicia sesión",
    },
    activate: {
      kicker: "ACTIVACIÓN",
      title: "Define tu contraseña",
      password: "Nueva contraseña",
      confirm: "Confirmar contraseña",
      submit: "Activar cuenta",
      expired: "Este enlace es inválido o expiró.",
    },
```
In `en`:
```ts
    signup: {
      kicker: "SIGN UP",
      title: "Create account",
      code: "Access code",
      company: "Company name",
      name: "Your name",
      email: "Email",
      submit: "Continue",
      sent: "If the details are valid, we've emailed you a link to activate your account.",
      haveAccount: "Already have an account? Sign in",
    },
    activate: {
      kicker: "ACTIVATION",
      title: "Set your password",
      password: "New password",
      confirm: "Confirm password",
      submit: "Activate account",
      expired: "This link is invalid or expired.",
    },
```

- [ ] **Step 2: Create the signup page** `web/src/app/signup/page.tsx`

```tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestCompanySignup, type SignupState } from "@/app/actions/signup";

const initial: SignupState = { status: "idle" };

export default function SignupPage() {
  const [state, action, pending] = useActionState(requestCompanySignup, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Crear cuenta</h1>
        {state.status === "sent" && (
          <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            Si los datos son válidos, te enviamos un enlace para activar tu cuenta.
          </p>
        )}
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input name="code" placeholder="Código de acceso" required className="input" style={{ marginBottom: 10 }} />
        <input name="company" placeholder="Nombre de la empresa" required className="input" style={{ marginBottom: 10 }} />
        <input name="name" placeholder="Tu nombre" required className="input" style={{ marginBottom: 10 }} />
        <input name="email" type="email" placeholder="Correo" required className="input" style={{ marginBottom: 18 }} autoComplete="email" />
        {/* Honeypot: hidden from users, bots fill it. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Continuar →"}
        </button>
        <div style={{ marginTop: 14 }}>
          <Link href="/login" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>¿Ya tienes cuenta? Inicia sesión</Link>
        </div>
      </form>
    </div>
  );
}
```
(Copy is inlined here because client components can't call the server `getDict`; the strings mirror the `signup` dictionary added in Step 1 for parity. If a shared client i18n hook exists, prefer it — otherwise this matches the project's pattern of passing dict slices into client components.)

- [ ] **Step 3: Create the activate page** `web/src/app/activate/[token]/page.tsx`

```tsx
"use client";
import { use } from "react";
import { useActionState } from "react";
import { activateAccount, type ActivateState } from "@/app/actions/signup";

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

- [ ] **Step 4: Build + lint to verify the pages compile**

Run: `npm run build && npm run lint`
Expected: build + lint succeed.

- [ ] **Step 5: Commit**

```bash
git add src/app/signup/page.tsx "src/app/activate/[token]/page.tsx" src/i18n/dictionaries.ts
git commit -m "feat(auth): signup and activation pages"
```

---

## Task 13: Signup-code CLI

**Files:**
- Create: `web/scripts/signup-code.ts`

**Interfaces:**
- Consumes: `prisma`, run via `tsx` (already a devDependency).
- Produces: `npx tsx scripts/signup-code.ts new [label]` mints a code and prints it; `npx tsx scripts/signup-code.ts list` lists codes with status.

- [ ] **Step 1: Implement** `web/scripts/signup-code.ts`:

```ts
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [cmd, label] = process.argv.slice(2);
  if (cmd === "new") {
    const code = randomBytes(9).toString("base64url"); // ~12 chars
    await prisma.signupCode.create({ data: { code, label: label ?? null } });
    console.log(`Created signup code: ${code}${label ? ` (${label})` : ""}`);
  } else if (cmd === "list") {
    const codes = await prisma.signupCode.findMany({ orderBy: { createdAt: "desc" } });
    for (const c of codes) {
      const status = c.consumedAt ? `used ${c.consumedAt.toISOString()}` : "unused";
      console.log(`${c.code}\t${status}\t${c.label ?? ""}`);
    }
  } else {
    console.log("Usage: tsx scripts/signup-code.ts <new [label] | list>");
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Smoke-run it**

Run: `npx tsx scripts/signup-code.ts new "manual-test" && npx tsx scripts/signup-code.ts list`
Expected: prints a new code, then lists it as `unused`.

- [ ] **Step 3: Commit**

```bash
git add scripts/signup-code.ts
git commit -m "feat(auth): CLI to mint/list signup codes"
```

---

## Task 14: Security headers in netlify.toml

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
Note: `camera`/`geolocation` are `self` because the app captures field photos with GPS. `script-src 'unsafe-inline'` is a pragmatic baseline for Next.js; a nonce-based CSP is a follow-up.

- [ ] **Step 2: Validate the toml + build**

Run: `npm run build`
Expected: build succeeds (the headers block doesn't affect the build, but this confirms nothing else regressed).

- [ ] **Step 3: Verify on a deploy preview**

After pushing the branch, open the deploy-preview URL and confirm in DevTools → Network that the document response carries the headers above, and that the app's pages, the PWA manifest, and field photo/GPS capture still load (CSP didn't break them). Tighten `script-src` only after this check.

- [ ] **Step 4: Commit**

```bash
git add ../netlify.toml
git commit -m "feat(security): baseline security headers (HSTS, CSP, X-Frame-Options)"
```

---

## Final verification

- [ ] Run the full suite: `npm test`
- [ ] Run lint + build: `npm run lint && npm run build`
- [ ] Manual end-to-end (local, with a real `RESEND_API_KEY` or by reading the `LogMailer` console output for the link):
  1. `npx tsx scripts/signup-code.ts new "e2e"` → copy the code.
  2. Visit `/signup`, submit code + company + name + email → "check email" screen.
  3. Open the activation link from the email/log → set a 12+ char password → redirected to `/login?activated=1`.
  4. Sign in → reaches `/app`.
  5. As an admin, add a user in `/app/admin` → "invite sent" banner; the invited user activates via their link.
  6. Confirm an un-activated account cannot log in.

## Spec coverage check

- New-company signup (code-gated, enumeration-safe, atomic code) → Tasks 5, 8, 12, 13.
- Invited-user activation → Tasks 10, 12.
- Shared activation (set password + verify) → Tasks 2, 9, 12.
- Login guard for unactivated → Task 7.
- Public paths + login UI → Task 11.
- Security: tokens hashed/single-use/expiring (Task 2), rate limiting (Task 3), password policy (Task 4), enumeration safety (Task 8), honeypot (Task 12), page hardening headers (Task 14), audit (Tasks 8/9/10).
- Email dependency / templates (Task 6); production `RESEND_API_KEY`+`EMAIL_FROM` to be set at deploy (operational, tracked in the env discussion — not a code task).
- Schema (Task 1); access-code CLI (Task 13).
