# Login Entry Points, Self-Service Password Reset & raphel360.com Domain — Design

**Date:** 2026-07-08
**Branch context:** `feat/web-security-hardening`
**Status:** Approved design, pending implementation plan

## Summary

Three gaps found while reviewing the shipped access-request onboarding on a local host:

1. **The login page is a dead end for new users** — there is no link to `/request-access`
   (the whole point of the onboarding work) and no way to start a password reset.
2. **Users cannot reset their own password** — only an ADMIN can, and that path emails a
   **plaintext temporary password**, the exact wart the invite rework just retired.
3. **Emails and links must carry the product domain** — sender `no-reply@raphel360.com`,
   and all emailed links/QR/PDF verify URLs on `https://raphel360.com` (domain is purchased;
   the app moves to it).

The fix: add both entry points to `/login`; build a **self-service password reset** on the
already-proven activation-token infrastructure (new `PASSWORD_RESET` token purpose); convert
the admin reset to send the **same reset link** so **no email in the system ever carries a
credential**; and a config/DNS runbook for the domain (near-zero code).

## Current state (what exists today)

- `src/app/login/page.tsx`: email + password form, `error`/`activated` flashes, a "← back"
  link. Nothing else — no request-access link, no forgot-password link.
- `src/app/actions/admin.ts` → `resetUserPassword`: ADMIN-only, tenant-scoped, mints a CSPRNG
  temp password, emails it in plaintext via `passwordResetEmail`, audits `user.password_reset`.
  UI hides it for unactivated users (they get "Reenviar invitación" instead).
- Token infra (`src/lib/auth/tokens.ts`): `VerificationToken` rows keyed by SHA-256
  `tokenHash`, `purpose` enum (`TokenPurpose { ACTIVATION }`), 24h TTL, single-use via
  `consumedAt`, bulk-consume per user. E2E-verified on this branch (single-use, garbage-token,
  short-password paths all live-tested).
- Rate limiting (`src/lib/auth/rate-limit.ts`): generic DB-backed `rateLimit(key, max, windowMs)`;
  intake and activation both use 10/hour/IP.
- Email (`src/lib/email/`): `RESEND_API_KEY` + `EMAIL_FROM` → Resend; otherwise `LogMailer`
  (logs to+subject only, never bodies).
- Links: `activationUrl()` and QR/PDF verify links all derive from `APP_URL`
  (localhost fallback in dev).
- Password policy: 12+ chars, enforced server-side (`password-policy.ts`), verified E2E.
- Public paths allowlist in the auth middleware covers `/request-access` and `/activate`.

## Design

### Part 1 — Login page entry points

`src/app/login/page.tsx` gains two links (both languages via `t.login`):

- **"¿Olvidaste tu contraseña?"** — small link directly under the password input →
  `/forgot-password`.
- **"¿No tienes cuenta? Solicitar acceso"** — in the card footer (opposite the "← back"
  link) → `/request-access`.
- New flash: `/login?reset=1` → **"Contraseña actualizada. Inicia sesión."** (mirrors the
  `activated=1` pattern).

i18n keys added to both `es` and `en` dictionaries under `login`.

### Part 2 — Self-service password reset

**Schema.** `TokenPurpose` gains `PASSWORD_RESET`. Enum-only migration; no new models.

**Token library.** Generalize `src/lib/auth/tokens.ts` from ACTIVATION-hardcoded to
purpose-parameterized:

- `createToken(userId, purpose, now?)` → raw token; TTL by purpose: **ACTIVATION 24h**,
  **PASSWORD_RESET 2h**.
- `verifyToken(raw, purpose, now?)` → `{id, userId} | null`. A token minted for one purpose
  **must not** verify for another (purpose checked against the row).
- `consumeTokens(tx, userId, purpose, now?)` → consumes all outstanding tokens **of that
  purpose only** (a pending activation token must survive an unrelated reset, and vice versa).
- Existing exports (`createActivationToken`, etc.) become thin wrappers or are inlined at call
  sites — implementation plan's choice; external behavior identical.

**`requestPasswordReset` action** (new, public, in `src/app/actions/` alongside `access.ts`):

- Input: `email` (+ honeypot field, same trick as request-access).
- Rate limit: `reset:${ip}`, **5/hour/IP**.
- Enumeration-safe: **always** returns the same neutral result — "Si existe una cuenta,
  enviaremos un enlace." Silently no-ops when the email is unknown, the account is
  **unactivated** (`emailVerifiedAt` null — they must use their activation link), or
  **disabled** (`disabledAt` set).
- Happy path: mint `PASSWORD_RESET` token, send `passwordResetLinkEmail(to, url)` best-effort
  (deferred via `after()`, same as the operator notice).
- Reset URL: `${APP_URL}/reset/<raw>`.

**`resetPassword` action** (new): verifies the token (purpose `PASSWORD_RESET`, unexpired,
unconsumed), validates the new password (12+ policy, confirm match), then atomically —
same transaction shape as `activateAccount` — sets `passwordHash` and consumes all
outstanding `PASSWORD_RESET` tokens for the user. Redirects to `/login?reset=1`.
Invalid/expired/consumed token → the same generic "El enlace es inválido o expiró." UI the
activate page uses.

**Pages** (both added to the public-paths allowlist):

- `/forgot-password` — single email field + submit, neutral confirmation state. Mirrors the
  request-access page structure.
- `/reset/[token]` — set new password + confirm. Mirrors `/activate/[token]`; the
  password-pair form markup is extracted into a shared component used by both pages.

**Admin reset unification.** `resetUserPassword` in `admin.ts`:

- Keeps: ADMIN-only guard, tenant scoping, the audit entry (`user.password_reset`), and the
  hide-for-unactivated UI rule.
- Changes: instead of minting a temp password, it mints a `PASSWORD_RESET` token and sends
  the **same** `passwordResetLinkEmail`. No password material is generated, flashed, or
  emailed.
- The old `passwordResetEmail` (temp-password) template is **deleted**.

**Security invariants** (test-enforced):

1. No email ever contains a credential — grep-level check that no template interpolates a
   password.
2. Purpose isolation — an ACTIVATION token submitted on `/reset/…` (and a PASSWORD_RESET
   token on `/activate/…`) is rejected with the same generic invalid-link UI.
3. Single-use — completing a reset consumes the used token and all other outstanding
   PASSWORD_RESET tokens for that user; re-submitting the link fails.
4. Enumeration safety — unknown / unactivated / disabled emails produce byte-identical
   neutral responses and mint no tokens.
5. Reset never activates — for an unactivated user, no path through reset can set
   `emailVerifiedAt` (the action refuses before minting).

**Accepted limitation:** existing JWT sessions are not revoked on password change (they age
out naturally). Same posture as today; `requireFreshSession` already handles disable-based
revocation.

### Part 3 — Domain: raphel360.com (ops runbook; near-zero code)

Order matters — email DNS can verify before the app moves:

1. **Resend**: add domain `raphel360.com`, create the SPF + DKIM records it prescribes at the
   DNS host, wait for "verified".
2. **Netlify env**: `EMAIL_FROM=Raphel <no-reply@raphel360.com>` (requires 1),
   `APP_URL=https://raphel360.com`, plus the already-documented `RESEND_API_KEY`.
3. **Netlify domain**: attach `raphel360.com` as the primary custom domain on the
   `raphl-record360` site, `www.raphel360.com` as a redirect alias; Netlify provisions the
   TLS cert. HSTS/CSP already ship in `netlify.toml`.
4. Redeploy; verify a real activation + reset email end-to-end in production (also closes the
   "prod email keys unset" discrepancy from the deploy-topology notes).

Code touches: `.env.example` comments for `APP_URL`/`EMAIL_FROM` and this runbook recorded in
the deploy docs. Nothing else — every link generator already reads `APP_URL`.

## Testing

Follows the branch's TDD pattern (vitest, action-level against the dev DB):

- Token lib: purpose-parameterized mint/verify/consume; TTL boundary per purpose (2h vs 24h);
  purpose isolation both directions.
- `requestPasswordReset`: neutral response for unknown/unactivated/disabled; token minted only
  for eligible accounts; honeypot drop; 5/hour/IP rate limit boundary.
- `resetPassword`: happy path (hash updated, redirect target, all reset tokens consumed);
  short password rejected; garbage/expired/consumed token rejected; ACTIVATION token rejected.
- Admin path: `resetUserPassword` mints a link and sends no password material; audit row
  written; cross-tenant target still rejected.
- Login page: flash rendering for `reset=1` (same test shape as `activated=1`).

## Out of scope

- Session revocation on password change (JWT-lifetime limitation, documented above).
- Emailing "your password was changed" notifications.
- 2FA / passkeys.
- Rate limiting keyed per-email (IP-keyed matches the rest of the branch; revisit if abused).
