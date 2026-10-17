# Quest change log (October 2026 onward)

One entry per quest PR. Audience: Gamaliel and the next AI agent working in this repo. Facts only.

## Q0: Playwright e2e harness, real-user login (chore/e2e-harness, 2026-10-16)

- **What users will notice:** nothing. No app code changed; nothing under `web/src` was touched.
- **What changed in code:**
  - `web/playwright.config.ts`: projects `phone` (390x844, touch) and `desktop` (1280x800); starts `npm run dev`, or `npm run build && npm start` with `E2E_PROD=1`; loads `web/.env.e2e.local`.
  - `web/e2e/helpers/auth.ts`: `loginAs(page, "admin" | "resident")` through the real `/login` form; `signOut(page)` opens the phone drawer when needed.
  - `web/e2e/helpers/guards.ts`: `test` fixture that fails any test on console errors, page errors or CSP violations.
  - `web/e2e/helpers/prefs.ts`: `setLang` / `setTheme` via the app's own cookies `r360_lang` (`es`/`en`) and `r360_theme` (`dark` = night, `light` = day).
  - `web/e2e/smoke.spec.ts`: admin and resident log in, see the Obras dashboard, sign out, in es and en.
  - `web/e2e/setup/dev-fixture.spec.ts` (tag `@setup`): builds local demo obra "E2E Obra Demo" through the UI.
  - `web/package.json`: `@playwright/test` (exact version) and script `e2e`; `web/.gitignore`: Playwright output folders.
- **Migrations:** none.
- **Rules for future work:**
  - Specs import `test`/`expect` from `e2e/helpers/guards.ts`, not from `@playwright/test`, so the console/CSP guard always runs.
  - Select by role, label, placeholder and visible text using strings from `src/i18n/dictionaries.ts`; never add test ids or test-only code to `web/src`.
  - Credentials live only in gitignored `web/.env.e2e.local` (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_RESIDENT_EMAIL`, `E2E_RESIDENT_PASSWORD`). Never create users from tests.
  - Screenshots go to `web/e2e/artifacts/` (gitignored).
  - `@setup` specs are excluded unless `E2E_SETUP=1`, run on desktop only, and refuse any non-localhost base URL.
  - After a client-side navigation, wait for real page content before asserting: the URL changes while `loading.tsx` is still showing.
  - e2e stays out of Vitest's `include`; tsc and eslint cover it.
  - Login lockout: 5 failed logins for the same email and IP lock that pair for 15 minutes. E2E tests that exercise lockout must use a made-up email (e.g. lockout-test@raphel.test), never the E2E accounts, or parallel specs fail.
- **How to verify:**
  - `npm run e2e` from `web/` (8 smoke tests: 2 roles x 2 languages x 2 viewports).
  - Demo data: `E2E_SETUP=1 npx playwright test --grep @setup --project desktop`. It fills in only missing pieces and writes nothing once complete. Result: 3 bloques (Cocina, Lavandería, Sala) x 4 partidas, resident assigned.
- **Known limits:**
  - The smoke test covers login, dashboard and sign-out only; theme switching is not exercised.
  - Screenshots can catch the `.reveal` fade-in partway.
  - Prisma CLI reads only `web/.env`. Run it as `node --env-file=.env.local node_modules/prisma/build/index.js <cmd>`, and never create `web/.env`.

## Q1: Pilot blockers (fix/pilot-blockers, 2026-10-16)

- **What users will notice:** emails log in regardless of case or stray spaces; after 5 failed logins the 6th shows "Demasiados intentos…" with a reset link; a password reset lifts that email's lockout; phone keyboards no longer capitalize email fields; large plano uploads can reach R2 once the build sees the S3 vars; missing or foreign obra/partida/cambio links show a branded 404; crashes show a branded error screen with a "Código".
- **What changed in code:**
  - `src/lib/auth/email.ts`: `normalizeEmail()`, used by login, throttle keys, reset, access requests, `createUser`, `scripts/create-admin.ts`.
  - `src/lib/auth/credentials.ts`: exact lookup, then single case-insensitive legacy match; bcrypt runs against a cost-10 dummy hash on no-user/disabled/unactivated paths.
  - `src/lib/auth/authorize.ts` + `errors.ts`: authorize moved out of `auth.ts`; throws `LockedOutSignin` (`code = "locked"`) when blocked. `login/page.tsx` maps it to `?error=locked`.
  - `src/app/actions/password-reset.ts`: after commit, deletes only `<email>|*` LoginAttempt keys.
  - `src/lib/security-headers.ts`: `connect-src` adds `new URL(S3_ENDPOINT).origin` when `S3_BUCKET` is set; throws if the endpoint is missing, invalid or not https.
  - `src/app/{error,global-error,not-found}.tsx`, `src/app/app/{error,not-found}.tsx`, `components/{error-screen,not-found-screen}.tsx`; copy in `src/i18n/errors-copy.ts`.
  - Obra, partida and cambio detail pages: `findFirst` + `notFound()` with the same access filter.
  - `vitest.config.ts`: `oxc.jsx.runtime = "automatic"` (Vite 8 ignores `esbuild`) so tests can render components.
- **Migrations:** none.
- **Rules for future work:**
  - Normalize every email with `normalizeEmail()`; never inline `trim().toLowerCase()`.
  - Lockout must stay existence-independent (blocked key throws before any user lookup). Do not add messages that differ for known vs unknown emails.
  - Prisma `startsWith`/`contains` leave `_` as a SQL wildcard: re-check matches literally before deleting.
  - Client components must not import `dictionaries.ts` values. Copy needed on the client goes in a small plain-data module (like `errors-copy.ts`) re-exposed in `dictionaries.ts`.
  - Error screens never render `error.message`; only `error.digest`.
  - Detail pages use `findFirst` + `notFound()`, never `findFirstOrThrow`, so missing and cross-tenant ids look identical.
  - Netlify: `S3_BUCKET` and `S3_ENDPOINT` need the "Builds" scope; the CSP is computed at build time.
  - Tests importing `@/lib/auth/errors` must mock `next-auth` with `@auth/core/errors`' `CredentialsSignin` (next-auth's entry does not load under Vitest).
- **How to verify:** `npm test` (602 tests); `npx playwright test e2e/pilot-blockers.spec.ts` against a production build; after deploy, `curl -sI https://www.raphel360.com/login | grep -i content-security-policy` must show the R2 origin in `connect-src`.
- **Known limits:**
  - F1 (CSP for R2) cannot be reproduced locally (no S3 in `.env.local`); unit tests plus the production curl check are its only verification.
  - Next 15.5 streams the /app shell through `/app/loading.tsx` before `notFound()` resolves; React recovers the boundary on the client and Next reports React error #419. The page shown is the correct 404. `e2e/pilot-blockers.spec.ts` ignores only that error, only after the 404 heading is visible. Revisit when Next is upgraded.
  - Lockout e2e runs leave `LoginAttempt` rows for `lockout-*@raphel.test` in the local DB.
  - Error boundaries are verified by render tests only; there is no route that triggers them on purpose.
  - `/forgot-password` and `/request-access` copy is still hardcoded Spanish.

## Q2: Time zone correctness (fix/app-timezone, 2026-10-16)

- **What users will notice:** reminders fire at the typed time (they fired 4 h early, and anything under 4 h ahead was rejected as past); record cards, signatures, conclusion, notifications, due dates and cambio times show Santo Domingo time with "GMT-4"; date filters include their whole "to" day; PDF reports and informes with a date-only "to" now include that evening's registros (they stopped at 19:59); informe prompts state "Horas en hora de República Dominicana (UTC-4)"; saving while offline no longer leaves the page.
- **What changed in code:**
  - `src/lib/time/zone.ts`: `APP_TIME_ZONE` (`NEXT_PUBLIC_APP_TIME_ZONE`, default `America/Santo_Domingo`, invalid falls back), `zonedWallTimeToUtc`, `startOfDayUtc`/`endOfDayUtc`, `parseInstantInput`, `parseDayBound`. Intl only.
  - `src/lib/format/datetime.ts`: every format pins `APP_TIME_ZONE`; new `formatRecordTime` (offset label); future instants are absolute, never "ahora". `src/lib/format/period.ts`: `formatPeriodDate`.
  - Composer and cambio form convert datetime-local to ISO in the browser (`src/lib/time/local-input.ts`); the input `min` is set after mount. Server parsers read offset-less values in `APP_TIME_ZONE`.
  - `parseRangeParam` / informe `parseDate`: date-only bounds are local days. PDF "Periodo" and informe PERIODO use `formatPeriodDate`.
  - `src/lib/offline/sync.ts`: `syncQueue` returns `{ synced }`; `OfflineProvider` refreshes only when it is > 0 (also drops the refresh on every page load). The composer no longer syncs or refreshes itself. A capture queued during a running pass is sent by that pass instead of waiting for the next page load.
- **Migrations:** none.
- **Accepted side effect:** the informe idempotency key changes for date-only periods, so the first identical request after deploy generates once more instead of reusing the old informe.
- **Rules for future work:**
  - No raw `toLocale*` in `web/src`. Use `formatRecordTime` for times that belong to the record, `formatTimestamp`/`formatDate` elsewhere.
  - Never `new Date(userInput)` on a wall-clock value: convert in the browser to ISO, or parse with `parseInstantInput`. Day filters use `parseDayBound` (or `startOfDayUtc`/`endOfDayUtc`).
  - Stored instants, `serverCreatedAt`, hashing and `idempotency.ts` stay UTC; PDF timestamps stay UTC with the "UTC" label.
  - Changing `NEXT_PUBLIC_APP_TIME_ZONE` needs a rebuild (inlined in the client bundle).
  - Call `router.refresh()` only after the server accepted work. `navigator.onLine` is not proof of a connection; a failed refresh navigates to the offline page.
- **How to verify:** `TZ=UTC npm test` and `TZ=Asia/Tokyo npm test` (647 tests); `E2E_PROD=1 npx playwright test e2e/app-timezone.spec.ts --workers=1` against a production build.
- **Known limits:**
  - Offline entries queued by older builds hold offset-less values and are read as Santo Domingo time, whatever the device zone was.
  - On phone the pending "Resolver" button sometimes stays disabled after the action succeeds; the spec reloads to confirm the resolution.
  - E2E registros stay in the local DB (append-only), all in "Pruebas automáticas" (bloque Sala, E2E Obra Demo), with reminders resolved.
