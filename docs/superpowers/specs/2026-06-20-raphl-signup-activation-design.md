# Self-Signup & Account Activation — Design

**Date:** 2026-06-20
**Branch context:** `feat/web-security-hardening`
**Status:** Approved design, pending implementation plan

## Summary

Add account creation to the web app via two flows that share one email-verification
("activation") mechanism:

1. **New-company self-signup** — gated by an access code you hand out. A valid code lets a
   visitor create a new `Company` and become its first `ADMIN`.
2. **Invited-user activation** — an admin creates a user inside their company; the user
   receives an activation link, sets their own password, and confirms their email.

Both flows create the account **inactive** (no password, no verified email) until the
emailed link is clicked. This is the confirmation step. Until then the account cannot log in.

This replaces the current invite mechanism, where `createUser` emails a plaintext temporary
password. The branch's stated security-headers work (`netlify.toml` `[[headers]]`) is folded
in, since signup/login are the surfaces that need it most.

## Current state (what exists today)

- `/login` is sign-in only (Credentials provider, bcrypt). No registration.
- Users are minted by admins (`src/app/actions/admin.ts` → `createUser`): a CSPRNG temp
  password is hashed and **emailed in plaintext** (best-effort) and flashed to the admin.
- Multi-tenant: every `User` belongs to a `Company`. `Role` ∈ {ADMIN, MANAGER, SUPERVISOR, RESIDENT}.
- `User.disabledAt` exists; revocation/freshness enforced in the Node runtime
  (`requireFreshSession`), not the edge middleware.
- A DB-backed throttle exists (`src/lib/auth/login-throttle.ts`, `LoginAttempt` model):
  15-min window, 5 failures → block. Keyed by `email|ip`.
- Email is abstracted (`src/lib/email/`): `RESEND_API_KEY` present → real send, else
  `LogMailer` logs only. `sendBestEffort` swallows failures.
- `/verify/[code]` is unrelated — a public certificate for an *obra* registration code.

## Approach

Approach A: build on the existing hand-rolled patterns (Credentials provider, DB-backed
throttle, email abstraction). Rejected alternatives: NextAuth Prisma adapter + email provider
(large churn to the clean JWT-only setup, reimplements features we'd own anyway); stateless
signed-token links (can't be made truly single-use / revocable — weaker for the stated
"secure + confirm" goal).

## Data model (Prisma)

### `User` changes
- Add `emailVerifiedAt DateTime?` — null until the activation link is used. This is the
  confirmation flag.
- Change `passwordHash` to nullable (`String?`) — a not-yet-activated user has no password.
  Widening an existing column is a safe migration.

### New `VerificationToken`
```prisma
model VerificationToken {
  id         String       @id @default(cuid())
  tokenHash  String       @unique   // sha256 of the random token; the raw token lives ONLY in the emailed link
  purpose    TokenPurpose
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  consumedAt DateTime?              // single-use
  createdAt  DateTime     @default(now())
}

enum TokenPurpose {
  ACTIVATION
}
```
`PASSWORD_RESET` is intentionally **not** added now (YAGNI); the enum leaves room to reuse
this table for password reset later (a follow-up that would retire the admin
`resetUserPassword` plaintext flow).

### New `SignupCode`
```prisma
model SignupCode {
  id                  String    @id @default(cuid())
  code                String    @unique
  label               String?            // note to yourself: who you handed it to
  expiresAt           DateTime?
  consumedAt          DateTime?          // single-use
  consumedByCompanyId String?
  createdAt           DateTime  @default(now())
}
```

A new `User.verificationTokens VerificationToken[]` back-relation is added to satisfy Prisma.

## Flow A — New-company self-signup (code-gated)

1. Visitor opens `/signup`. Form fields: **access code · company name · your name · email**,
   plus a hidden honeypot field. No password (set later via the link, so both flows share one
   activation page).
2. Server action `requestCompanySignup`:
   - Rate-limit by IP (see Throttling).
   - If the honeypot is filled, return the neutral success screen without doing anything.
   - Validate the access code **atomically**:
     `updateMany({ where: { code, consumedAt: null, OR expiresAt gate }, data: { consumedAt: now } })`
     must affect exactly 1 row, preventing double-spend. Invalid/expired/used → generic error
     (no oracle distinguishing the cases).
   - Enumeration-safe email check: if a user with this email already exists, **do not** create
     anything and **do not** reveal it — send an `alreadyRegisteredEmail` and show the same
     neutral screen. (The consumed code is rolled back / not consumed in this branch — see note.)
   - Otherwise, in one transaction: create `Company` → create `User` (role `ADMIN`,
     `emailVerifiedAt`=null, `passwordHash`=null) → set `SignupCode.consumedByCompanyId`.
   - Mint an `ACTIVATION` token (see Tokens), send `accountActivationEmail` with
     `${APP_URL}/activate/<rawToken>`.
   - Write an audit log entry (`company.created`, actor = the new admin).
3. Always render the same neutral "Check your email" screen.

**Code-consume vs enumeration ordering:** validate-and-consume the code first; if the email
turns out to already exist, *release* the code (set `consumedAt`/`consumedByCompanyId` back to
null in the same transaction) so a valid code isn't burned by an already-registered email.
The whole action runs in a transaction so this is atomic.

## Flow B — Invited-user activation

1. Admin "Add user" (existing `/app/admin` UI) calls a reworked `createUser`:
   - ADMIN-only, tenant-scoped, role validated against the enum (unchanged guards).
   - Create the user **inactive** (`emailVerifiedAt`=null, `passwordHash`=null) in the admin's
     company with the chosen role. No temp password.
   - Mint an `ACTIVATION` token; send `accountActivationEmail`.
   - Replace the "temp password shown to admin" banner with **"Invite sent · Resend"**.
   - Audit: `user.invited`.
2. A `resendInvite` action (ADMIN-only, tenant-scoped) re-mints a token and re-sends for users
   who are still inactive.
3. Same `/activate/<token>` page as Flow A.

## Shared `/activate/[token]` page

- GET: look up `sha256(token)`. If missing / expired / already consumed → friendly
  "link expired or already used" page. For invited users it points them to ask their admin to
  resend; for signup it offers a resend path.
- Renders a **set-password** form (password + confirm), validated by the password policy.
- `activateAccount` server action:
  - Rate-limit by IP.
  - Re-validate the token (single-use, unexpired) — fetch by hash, check `consumedAt` is null
    and `expiresAt` is in the future.
  - In one transaction: set `user.passwordHash` (bcrypt), `user.emailVerifiedAt`=now, token
    `consumedAt`=now. Consume any other outstanding ACTIVATION tokens for that user.
  - Audit: `user.activated`.
  - Redirect to `/login` with a success flash ("Account activated — please sign in").

## Login changes

- `src/auth.ts` `authorize()`: after the existing user/disabled/password checks, also reject
  when `!user.passwordHash || !user.emailVerifiedAt` (returns the same neutral `null`).
  Unactivated accounts cannot log in.
- `src/auth.config.ts`: add `/signup` and `/activate` to the public path allowlist in the
  `authorized` callback.
- Login page (`src/app/login/page.tsx`): add a **"Create account →"** link to `/signup` and
  render success/info flashes (activated, check-email).

## Security ("secure the information and ensure confirmation")

- **Passwords:** bcrypt cost 10 (existing). Server-side length policy (default min 12). Never logged.
- **Link tokens:** 32-byte CSPRNG (`crypto.randomBytes`), URL-safe base64. DB stores **only**
  `sha256(token)` — a DB leak cannot be used to activate an account. Single-use (`consumedAt`)
  and expiring (24h). Lookup by the unique `tokenHash` index.
- **Confirmation:** the account has no password and `emailVerifiedAt`=null until the link is
  used; login is blocked until then. Clicking the link is the email-ownership proof.
- **Account enumeration:** signup and resend always return the same neutral screen regardless
  of whether the email exists; the difference is only which email gets sent.
- **Rate limiting:** reuse the `LoginAttempt`-style throttle with a new key namespace
  (e.g. `signup:<ip>`, `activate:<ip>`) on signup, activate, and resend. Implemented as a thin
  wrapper / generalization of `login-throttle.ts` rather than a copy.
- **Access-code gating:** single-use, expirable, atomically consumed, generic error on
  invalid (no validity oracle).
- **Bots:** the access code already blocks random signups; add a near-free hidden honeypot
  field. No CAPTCHA (YAGNI).
- **Page hardening (branch purpose):** add a `[[headers]]` block to `netlify.toml`:
  `Strict-Transport-Security` (HSTS, long max-age + includeSubDomains), a `Content-Security-Policy`,
  `X-Frame-Options: DENY` (auth forms must not be framable — clickjacking), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
  CSP is authored to allow the app's own scripts/styles (Next.js) and the manifest/PWA assets;
  it is validated against a real deploy preview before merge.
- **Audit:** `writeAudit` entries for `company.created`, `user.invited`, `user.activated`.

## Email dependency

New templates in `src/lib/email/templates.ts`:
- `accountActivationEmail(to, name, activationUrl)`
- `alreadyRegisteredEmail(to, loginUrl)`

The old `userInviteEmail` (plaintext temp password) usage is removed from `createUser`.

**Production requires `RESEND_API_KEY` + `EMAIL_FROM`** — without them, `LogMailer` only logs
the link and real users cannot finish signing up. These env vars ship with this feature.
Activation/invite sends are **not** silent best-effort: a send failure surfaces a
"couldn't send — resend" state so nobody is stranded. (`sendBestEffort` is still fine for
notifications elsewhere.)

## Access-code management

A CLI script `web/scripts/signup-code.ts` mints and lists codes (there is no cross-company
super-admin, so codes are created out-of-band by the operator). A full admin UI is a later
follow-up, explicitly out of scope here.

## Files touched (overview)

- `web/prisma/schema.prisma` — `User.emailVerifiedAt`, `User.passwordHash?`, `VerificationToken`
  + `TokenPurpose`, `SignupCode`; new migration.
- `web/src/lib/auth/tokens.ts` (new) — generate / hash / verify / consume activation tokens.
- `web/src/lib/auth/throttle.ts` (new or generalized from `login-throttle.ts`) — namespaced
  rate limiting.
- `web/src/lib/auth/password-policy.ts` (new) — validate password strength.
- `web/src/app/signup/page.tsx` (new) + `requestCompanySignup` action.
- `web/src/app/activate/[token]/page.tsx` (new) + `activateAccount` action.
- `web/src/app/actions/admin.ts` — rework `createUser` to activation-link; add `resendInvite`.
- `web/src/auth.ts` — login guard for unactivated accounts.
- `web/src/auth.config.ts` — `/signup`, `/activate` public paths.
- `web/src/app/login/page.tsx` — "Create account" link + flashes.
- `web/src/lib/email/templates.ts` — activation + already-registered templates.
- `web/scripts/signup-code.ts` (new) — mint/list codes.
- `netlify.toml` — security `[[headers]]` block.
- `web/src/i18n/*` — new strings (signup, activate, login link).

## Testing (vitest, against real Prisma like the existing suite)

- **Unit:** token hash/expiry/consume; password policy; atomic code consume (no double-spend).
- **Integration:**
  - Signup with valid / invalid / expired / already-used code.
  - Enumeration neutrality (existing email → neutral screen, code not burned, no new records).
  - Signup creates `Company` + `User` inactive (no password, not verified).
  - Activate: valid token sets password + `emailVerifiedAt` and is single-use; expired /
    consumed tokens rejected.
  - Login blocked before activation, allowed after.
  - `createUser` creates an inactive user and sends an activation link with **no** plaintext
    password; `resendInvite` re-mints/re-sends only for inactive users.

## Decisions

1. Password minimum length: **12**.
2. Activation token TTL: **24h**.
3. After activation: **redirect to `/login`** with a success flash (not auto-login).
4. Access codes minted via **CLI script** now; admin UI is a later follow-up.
5. Security-headers `[[headers]]` block is **included in this PR** (branch purpose).

## Out of scope (follow-ups)

- Password-reset-via-link (would reuse `VerificationToken` with a new `PASSWORD_RESET` purpose
  and retire the admin plaintext reset).
- Admin UI for managing signup codes.
- CAPTCHA / stronger bot mitigation beyond the honeypot + access code.
