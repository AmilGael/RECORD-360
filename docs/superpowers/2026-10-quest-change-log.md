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
- **How to verify:** `TZ=UTC npm test` and `TZ=Asia/Tokyo npm test` (653 tests); `E2E_PROD=1 npx playwright test e2e/app-timezone.spec.ts --workers=1` against a production build (20 tests, offline included).
- **Known limits:**
  - Offline entries queued by older builds hold offset-less values and are read as Santo Domingo time, whatever the device zone was.
  - On phone the pending "Resolver" button sometimes stays disabled after the action succeeds; the spec reloads to confirm the resolution.
  - E2E registros stay in the local DB (append-only), all in "Pruebas automáticas" (bloque Sala, E2E Obra Demo), with reminders resolved.

## Q3: Volver, pending Resolve, capture status (feat/volver, 2026-10-17)

- **What users will notice:** every app screen except the dashboard root has Volver (never the browser's Back). It returns to the last in-app screen, or to the page's parent if the tab has no history. Partida crumbs are Obras › Obra › Bloque › Partida. Resolving several reminders in a row no longer leaves Resolver stuck. After queueing a registro the composer says it is on this phone, then "Registrado y sellado." once the server takes it; a refusal shows the error and points at the sync list.
- **What changed in code:**
  - `lib/nav/trail.ts` + `nav-trail.tsx` (sessionStorage `raphel:nav-trail`) + `back-button.tsx`. `reconcileOnPop` keeps the trail when only the top equals current (transient-param popstate). A push of the previous screen pops (missed popstate / remount after browser back) so Volver cannot bounce forward.
  - Dashboard `page`/`loading` moved to `app/app/(home)/`; `operator/access-requests/loading.tsx` added. The root `/app` loading boundary is gone.
  - `PendingList` hides a resolved row with `useOptimistic` while the action runs; failure restores the row and shows `pendingWork.resolveError`.
  - `lib/offline/capture-status.ts`: `nextCaptureState` and `syncErrorText`. Sync stores `errorCode` `session_expired` / `forbidden` instead of Spanish text. Composer notices use theme tokens.
- **Migrations:** none.
- **Rules for future work:**
  - Volver is `router.push` of the previous trail entry, never `router.back()`. Only `/app` paths; cap 50. Wrap every sessionStorage access.
  - Client-made sync errors are codes; map them at the UI. Legacy queue items with only `error` render that text.
  - Do not add timers, retries or forced re-renders to paper over a stuck transition.
- **How to verify:** unit tests for trail, capture-status and sync codes. `E2E_PROD=1` `pending-resolve`, `volver`, `capture-status` (phone + desktop, es/en, night/day where the UI changed).
- **Known limits:**
  - Root cause of the stuck Resolver: bundled react-dom (`19.2.0-canary-0bdb9206-20250818`, Next 15.4 through 16.4) drops a ping that arrives during render (`pingSuspendedRoot` when `executionContext & 2`, [react/react#37805](https://github.com/react/react/issues/37805)). Phone production: **21/40 failed** after only narrowing the loading boundary; **0/40 failed** after optimistic Resolve. The hang can still stall `router.push` (Volver after browser back) and `<Link>` clicks; Volver e2e follows setup hrefs with `goto` for that reason. Planos → Analítica → Volver flaked 1/6 on desktop.
  - React #419 on app 404s is gone (0/20 after the route group; Q1's swallow was removed).
  - Server validation messages stay in the language the API sent. The 4xx fallback "No se pudo registrar." is still Spanish.
  - E2E registros stay in "Pruebas automáticas"; their reminders are resolved.

## Q4: Partidas list with half-screen panel (feat/partida-panel, 2026-10-17)

- **What users will notice:** opening a bloque shows the partida list on the left and a panel on the right (desktop, equal columns). Phone: the panel is a 55dvh sheet from the bottom. Tapping a row opens the panel without leaving the list; the first open is a history step, swapping rows replaces it, browser Back / Cerrar / Escape close it. Rows show last activity, 7-day brass and 14-day rust aging, and a Concluida badge. Nuevo registro lands on the Cuaderno composer. An assigned resident still sees Editar partida (same permission as before). Progress 100 still only via Concluir.
- **What changed in code:**
  - `lib/partida/preview.ts`: `getPartidaPreview` (access + `deletedAt` null; last 5 registros; text 280 chars; hash prefix 8; first IMAGE url; open CRs on the partida or its bloque) and `lastActivityByPartidaIds` (one `registro.groupBy`). `canEdit` = company-wide role or a `projectAssignment` — same as today's `canEditStructure`. No authz change.
  - `GET /api/partidas/[id]/preview`: `requireFreshSession`, 404 when null, `Cache-Control: private, no-store`, 401/403.
  - `lib/partida/aging.ts`: 7 / 14 day marks.
  - `lib/nav/trail.ts`: `onlyPChanged` + `replaceTop`. Push and `reconcileOnPop` treat a `p`-only change as the same screen, so Volver from the Cuaderno still lands on the list with that partida selected.
  - `partida-workspace.tsx`: native `history.pushState`/`replaceState` with `null` (not `history.state` — a `__NA` payload skips Next 15.5's ACTION_RESTORE patch). AbortController fetch; optimistic `run()` then refetch + `router.refresh()`; `openedByPush` + `history.back` vs replace on close.
  - `partida-panel.tsx`: view with no hooks. Hides Editar partida, progress, Concluir, Reabrir when `canEdit` is false. Concluded partidas never show a progress input.
  - `project-file-tree.tsx`: rows are buttons, not links; last activity and Concluida on the row; inline edit forms removed (they live in the panel).
  - `partida-summary.tsx` deleted (nothing imported it).
  - `log-composer.tsx`: `id="composer"`; `#composer` focuses the textarea.
  - `globals.css`: `--brass` / `--brass-bg` next to `--state-*` (day `#8a6c1a`, night `#b08a2e`); aging marks use the token; workspace 1fr 1fr ≥900px, mobile 55dvh sheet; 4px tree-row-band; coarse 44px row/close.
  - Dictionaries es+en: `newRegistro`, `openCuaderno`, `editPartida`, `panelOffline` (exact strings), `panelClose`, `aging7`/`aging14`, `noActivity`, `tagsLabel`.
- **Migrations:** none.
- **Rules for future work:**
  - Panel selection must not RSC-fetch: `pushState(null, …)` so Next patches it to ACTION_RESTORE. Passing `history.state` skips the patch.
  - `canEdit` on the panel is `canEditStructure`. Do not invent a narrower resident rule here.
  - Progress 100 only through Concluir. The concluded panel has no progress field.
  - Aging tokens: `--brass` / `--brass-bg`, not a hardcoded `#b08a2e`.
  - After a client-side create, `router.refresh()` can hang on the same react-dom ping (react/react#37805); e2e waits for the `next-action` POST then reloads.
- **How to verify:** `npm test` (708). `npx playwright test e2e/partida-panel.spec.ts` phone 390×844 + desktop 1280×800, es/en, night/day. `npx playwright test e2e/setup/partida-load.spec.ts --project desktop` (300 rows). `canEdit=false` is the unit test in `partida-panel.test.ts` (no e2e account in that state).
- **Known limits:**
  - 300-row desktop load: panel open **57ms** (under 1s). `content-visibility: auto` was not added.
  - Search on the obra overview is still a GET navigation. Same ping hang as other `<Link>` / form GETs. Follow-up: client search, same as the panel (do not change it in this quest).
  - Volver from Cuaderno → workspace with `p=` is covered. Phone "browser back then Volver" can still hang on react/react#37805 (Q3). Planos → Analítica → Volver still flakes on that ping. The notifications → partida Volver spec needs a live reminder notification for "Pruebas automáticas"; it is not a panel regression.
  - Remaining `#b08a2e` on health dots, supervisor avatar, and severity chips was not in this quest's files.
  - E2E leftover partidas named `Q4 concluida …` / `Q4 avance …` stay in bloque Cocina of E2E Obra Demo (append-only).
  - Playwright was run against this quest's production build on `:3002`; `:3000` may still be an older build. Carga's 300 rows are seeded and deleted in the load spec (`assertLocalDatabase`).
