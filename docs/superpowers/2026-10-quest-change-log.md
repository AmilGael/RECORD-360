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
- **How to verify:**
  - `npm run e2e` from `web/` (8 smoke tests: 2 roles x 2 languages x 2 viewports).
  - Demo data: `E2E_SETUP=1 npx playwright test --grep @setup --project desktop`. It fills in only missing pieces and writes nothing once complete. Result: 3 bloques (Cocina, Lavandería, Sala) x 4 partidas, resident assigned.
- **Known limits:**
  - The smoke test covers login, dashboard and sign-out only; theme switching is not exercised.
  - Screenshots can catch the `.reveal` fade-in partway.
  - Prisma CLI reads only `web/.env`. Run it as `node --env-file=.env.local node_modules/prisma/build/index.js <cmd>`, and never create `web/.env`.
  - Local Postgres for this machine is Homebrew 16 on port 5433.
