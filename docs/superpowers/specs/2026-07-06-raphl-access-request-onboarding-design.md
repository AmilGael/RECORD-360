# Access-Request Onboarding (vetted signup via SUPERADMIN approval) — Design

**Date:** 2026-07-06
**Branch context:** `feat/web-security-hardening`
**Status:** Approved design, pending implementation plan

## Summary

Add a **vetted onboarding** flow so only businesses you approve can enter the app:

1. A prospective business submits a public **Request access** form.
2. A platform operator (**SUPERADMIN**) reviews the request and **approves** or **rejects** it.
3. On approval, the system creates the business's **inactive** `Company` + first `ADMIN` and emails
   a **one-click activation link**. The business clicks it, sets a password, and is in.

There is **no self-serve code or `/signup` page** — the request form is the public front door,
operator approval is the gate, and the single-use activation token in the emailed link is the
secure entry.

This supersedes the code-gated half of the earlier design
(`2026-06-20-raphl-signup-activation-design.md`): the **activation** mechanism from that spec is
kept and reused; its `SignupCode` model and `/signup` code-entry page are **dropped** (the
one-click-link decision makes them unnecessary — YAGNI).

As part of the same work (Approach A), the existing in-app "Add user" invite
(`createUser`) is reworked to send the **same** activation link instead of today's emailed
plaintext temporary password, retiring that security wart and giving both onboarding paths one
consistent mechanism.

## Current state (what exists today)

- `/login` is sign-in only (Credentials provider, bcrypt). No registration.
- Users are minted by admins (`src/app/actions/admin.ts` → `createUser`): a CSPRNG temp password
  is hashed and **emailed in plaintext** (best-effort) and flashed to the admin.
- Multi-tenant: every `User` belongs to a `Company`. `Role` ∈ {ADMIN, MANAGER, SUPERVISOR, RESIDENT}.
  There is **no cross-company super-admin** today.
- `User.disabledAt` exists; revocation/freshness enforced in the Node runtime (`requireFreshSession`).
- A DB-backed throttle exists (`src/lib/auth/login-throttle.ts`, `LoginAttempt` model): 15-min
  window, 5 failures → block, keyed by `email|ip`.
- Email is abstracted (`src/lib/email/`): `RESEND_API_KEY` + `EMAIL_FROM` present → real send
  (now configured in production), else `LogMailer` logs only.
- The `2026-06-20-raphl-signup-activation-design.md` spec is **approved but not implemented**
  (no `SignupCode`, no activation tokens, no `/signup` in the codebase).

## Approach

Approach **A** (chosen): build the intake → review → approve → activation flow, **and** modernize
the existing `createUser` admin invite to use the same activation link. Reuse the existing
hand-rolled patterns (Credentials provider, DB-backed throttle, email abstraction).

Rejected: **B** (public flow only, leave `createUser` emailing temp passwords — two inconsistent
paths, plaintext hole stays); **C** (also keep `SignupCode` + `/signup` for manual/WhatsApp codes —
extra surface that contradicts the one-click-link choice).

## Data model (Prisma)

### `Role` — add a platform-level operator
```prisma
enum Role { SUPERADMIN  ADMIN  MANAGER  SUPERVISOR  RESIDENT }
```
A SUPERADMIN still belongs to a `Company` (the `companyId` column stays required — the promoted
operator lives in their existing company). The role only unlocks the operator review screen and
the approve/reject actions; all other tenant-scoped queries are unchanged, so nothing leaks across
companies. The first operator is created by promoting `gamaleguista@gmail.com` via a one-line
script (extension of `web/scripts/create-admin.ts`).

### `User` changes
- `passwordHash String?` — nullable; a not-yet-activated account has no password. Widening the
  existing non-null column is a safe migration (existing users already have hashes).
- `emailVerifiedAt DateTime?` — null until the activation link is used (the confirmation flag).
- Back-relation `verificationTokens VerificationToken[]`.

### New `VerificationToken`
```prisma
model VerificationToken {
  id         String       @id @default(cuid())
  tokenHash  String       @unique      // sha256 of the token; raw token only in the emailed link
  purpose    TokenPurpose               // ACTIVATION
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime                   // 24h TTL
  consumedAt DateTime?                  // single-use
  createdAt  DateTime     @default(now())

  @@index([userId])
}
enum TokenPurpose { ACTIVATION }   // leaves room for PASSWORD_RESET later (YAGNI now)
```

### New `AccessRequest`
```prisma
model AccessRequest {
  id               String        @id @default(cuid())
  businessName     String
  contactName      String
  email            String
  phone            String
  website          String?                    // optional
  message          String?                    // optional
  status           RequestStatus @default(PENDING)
  reviewedById     String?                    // which SUPERADMIN acted
  reviewedAt       DateTime?
  createdCompanyId String?                    // set on approval (traceability)
  createdUserId    String?
  createdAt        DateTime      @default(now())

  @@index([status, createdAt])
}
enum RequestStatus { PENDING  APPROVED  REJECTED }
```

One migration adds the `SUPERADMIN` enum value, the two `User` columns, `VerificationToken` +
`TokenPurpose`, and `AccessRequest` + `RequestStatus`.

## Flows & surfaces

### ① Public request form — `/request-access` (new public page)
Fields: business name, contact name, email, phone (required); website, message (optional); hidden
honeypot. Server action `requestAccess(prev, formData)`:
- IP rate-limit (`request:<ip>` namespace); honeypot filled → neutral success, no-op.
- Validate required fields present + basic email/phone shape.
- **Enumeration-safe:** if the email already has a `User` account or an existing PENDING request,
  still render the same neutral screen and quietly avoid creating a duplicate.
- Create `AccessRequest(PENDING)`.
- Email operator(s) a "new access request" notice.
- Render neutral **"Gracias, revisaremos tu solicitud"** screen.

### ② Operator review — `/app/operator/access-requests` (new, SUPERADMIN-only)
`requireSession` + `role === SUPERADMIN`; non-operators get forbidden/404. Lists PENDING requests
with all fields, plus the last N resolved for context. Each row: **Approve** / **Reject**.

- `approveRequest(formData: { requestId })` — SUPERADMIN guard; request must be `PENDING`
  (re-checked inside the transaction). If a `User` with that email already exists → do not
  duplicate; mark resolved and show an "already registered" notice. Otherwise, in one transaction:
  create `Company` (= business name) → create `User` (role `ADMIN`, email, name = contact,
  `passwordHash`=null, `emailVerifiedAt`=null) → mint an `ACTIVATION` token → update the request
  (`APPROVED`, `reviewedById`, `reviewedAt`, `createdCompanyId`, `createdUserId`). Then send the
  activation email. A send failure surfaces a "resend" state (not a silent drop). Audit:
  `access_request.approved` + `company.created`.
- `rejectRequest(formData: { requestId })` — SUPERADMIN guard; request must be `PENDING`; mark
  `REJECTED` (+ reviewer, timestamp). **No automatic decline email.** Audit: `access_request.rejected`.

### ③ Activation — `/activate/[token]` (new public page)
GET hashes the token and looks it up; missing/expired/consumed → friendly "link expired or already
used" page (tells them to contact you, since there is no public self-serve resend). Otherwise a
set-password form (password + confirm, min 12). Server action `activateAccount(prev, formData)`:
- IP rate-limit (`activate:<ip>`); validate password policy + match.
- Re-validate the token (fetch by hash; `consumedAt` null and `expiresAt` in the future).
- In one transaction: set `passwordHash` (bcrypt), `emailVerifiedAt`=now, consume the token(s).
- Audit: `user.activated`. Redirect `/login?activated=1` with a success flash.

### ④ Login guard + public paths
- `src/auth.ts` `authorize()`: after the user/disabled checks, reject when
  `!user.passwordHash || !user.emailVerifiedAt` (same neutral `null` as a bad password), and guard
  the now-nullable `passwordHash` before `bcrypt.compare`.
- `src/auth.config.ts`: add `/request-access` and `/activate` to the public path allowlist.

### ⑤ Emails (`src/lib/email/templates.ts`, via the configured Resend sender)
- `accountActivationEmail(to, name, activationUrl)` — the approval email carrying the one-click link.
- `newAccessRequestEmail(to, request)` — operator notification (sent to all SUPERADMIN users).

### ⑥ In-app invite rework (Approach-A extra)
`createUser` (ADMIN-only, tenant-scoped, role-validated) stops emailing a plaintext temp password;
it creates the user inactive and sends the **same** `accountActivationEmail`. A new `resendInvite`
action (ADMIN-only, tenant-scoped, inactive users only) re-mints and re-sends. The admin UI's
temp-password banner becomes an **"Invite sent · Resend"** banner. Audit: `user.invited`.

## Security

- **Operator gating is server-side** on the review page and both approve/reject actions
  (`requireSession` + `role === SUPERADMIN`), never UI-only.
- **Rate-limiting + honeypot** on `/request-access` and `/activate` (reuse the `LoginAttempt`-style
  throttle with new key namespaces). No CAPTCHA (YAGNI).
- **Link tokens:** 32-byte CSPRNG, URL-safe base64; DB stores only `sha256(token)`; single-use +
  24h expiry; lookup by the unique `tokenHash` index. A DB leak cannot activate an account.
- **Passwords:** bcrypt cost 10; server-side min length 12; never logged. No plaintext temp
  passwords anywhere after the `createUser` rework.
- **Enumeration safety:** the public request form always returns the same neutral screen regardless
  of whether the email exists; it never reveals account status.
- **Audit:** `access_request.approved` / `.rejected`, `company.created`, `user.activated`,
  `user.invited`.
- **Page hardening:** the branch's in-progress `netlify.toml` `[[headers]]` block (HSTS, CSP,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`)
  is finished as part of this work — login/activation/request are the surfaces that most need it.
  CSP validated against a deploy preview before merge.

## Edge cases

- **Email already has an account at approval** → no duplicate created; request marked resolved with
  an "already registered" notice on the row.
- **Request already reviewed** (double-click / two operators) → the action re-checks
  `status === PENDING` inside the transaction; the second attempt no-ops with a notice.
- **Activation link expired/used** → friendly page; no public self-serve resend, so it points them
  to contact you; you can re-approve / re-send from the operator screen.
- **User disabled between approval and activation** → activation still sets the password, but the
  login guard's `disabledAt` check keeps them out.

## Decisions / defaults

1. Entry method: **one-click activation link** (no self-serve codes, no `/signup`).
2. Operator authorization: new **SUPERADMIN** role; `gamaleguista@gmail.com` promoted to it.
3. Request form fields: business name, contact name, email, phone (required); website, message
   (optional). **No RNC.**
4. **Reject sends no automatic email.**
5. Operator notification emails go to **all users with role SUPERADMIN**.
6. Activation token TTL **24h**; password minimum length **12**.
7. Operator review route: **`/app/operator/access-requests`**, behind the existing login,
   SUPERADMIN-gated.
8. Approach **A**: also rework `createUser` to the activation link; retire plaintext temp passwords.
9. Security-headers `[[headers]]` block (branch purpose) is included.

## Files touched (overview)

- `web/prisma/schema.prisma` — `Role.SUPERADMIN`; `User.passwordHash?` + `User.emailVerifiedAt`;
  `VerificationToken` + `TokenPurpose`; `AccessRequest` + `RequestStatus`; new migration.
- `web/src/lib/auth/tokens.ts` (new) — mint / hash / verify / consume activation tokens; build URL.
- `web/src/lib/auth/rate-limit.ts` (new or generalized from `login-throttle.ts`) — namespaced limiter + `clientIp`.
- `web/src/lib/auth/password-policy.ts` (new) — password strength (min 12).
- `web/src/lib/auth/operator.ts` (new) — `requireSuperAdmin` guard helper.
- `web/src/app/request-access/page.tsx` (new) + `requestAccess` action.
- `web/src/app/activate/[token]/page.tsx` (new) + `activateAccount` action.
- `web/src/app/app/operator/access-requests/page.tsx` (new) + `approveRequest` / `rejectRequest` actions.
- `web/src/app/actions/access.ts` (new) — `requestAccess`, `approveRequest`, `rejectRequest`.
- `web/src/app/actions/activation.ts` (new) — `activateAccount`.
- `web/src/app/actions/admin.ts` — rework `createUser` to activation link; add `resendInvite`.
- `web/src/app/app/admin/page.tsx` — "Invite sent · Resend" banner replaces temp-password banner.
- `web/src/auth.ts` — login guard for unactivated accounts.
- `web/src/auth.config.ts` — `/request-access`, `/activate` public paths.
- `web/src/lib/email/templates.ts` — `accountActivationEmail`, `newAccessRequestEmail`.
- `web/scripts/create-admin.ts` — extend to set/promote role (SUPERADMIN).
- `web/src/i18n/dictionaries.ts` — strings for request-access, activate, operator screen, login flashes.
- `netlify.toml` — finish the security `[[headers]]` block.

## Testing (vitest, against real Prisma like the existing suite)

- **Unit:** token hash/expiry/consume; password policy; rate-limit window.
- **Integration:**
  - `requestAccess` creates a PENDING row; duplicate email / existing account → neutral screen, no
    duplicate; honeypot → neutral no-op.
  - `approveRequest` creates an inactive `Company` + `ADMIN` + a token and sends activation; it is
    idempotent if re-clicked (second call no-ops); email-already-exists path creates nothing.
  - `rejectRequest` marks REJECTED and sends no email.
  - `activateAccount` sets `passwordHash` + `emailVerifiedAt`, is single-use, and rejects
    expired/consumed tokens.
  - Login is blocked before activation and allowed after.
  - **SUPERADMIN gating:** non-operators are rejected on the review page and on approve/reject.
  - `createUser` sends an activation link with **no** plaintext password; `resendInvite` re-sends
    only for inactive users.

## Out of scope (follow-ups)

- Password-reset-via-link (would reuse `VerificationToken` with a `PASSWORD_RESET` purpose and
  retire the admin plaintext reset).
- A full admin UI to manage/search historical requests beyond the review list.
- Self-serve activation-link resend for the public flow (today the operator re-sends).
- CAPTCHA / stronger bot mitigation beyond honeypot + operator approval.
