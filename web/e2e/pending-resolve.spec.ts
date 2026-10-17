import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { dictionaries } from "../src/i18n/dictionaries";
import { fillAndSubmit, openTestPartida, resolvePendingRow, sdLocalInput, sealedCard } from "./helpers/partida";

// Q3 part B: on the pending queue, resolving several reminders in a row must
// leave every remaining Resolve button usable, with no reload in between.
// Before the optimistic list this failed about half the time on production
// builds: the bundled react-dom drops a ping that arrives during render
// (react/react#37805), so the action's transition never committed and the
// clicked button stayed disabled. The registros stay in "Pruebas automáticas"
// (append-only); their reminders are resolved by the test itself.

test.use({ timezoneId: "America/Santo_Domingo" });

test("resolves 3 reminders in a row without a reload", async ({ page }, info) => {
  const t = dictionaries.es;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "es");
  await loginAs(page, "resident");
  await openTestPartida(page, t);

  const run = `${info.project.name} ${Date.now()}`;
  const texts = [1, 2, 3].map((n) => `Resolver en fila ${n} ${run}`);
  for (const [i, text] of texts.entries()) {
    await fillAndSubmit(page, t, text, sdLocalInput(2 + i));
    await expect(sealedCard(page, text)).toBeVisible({ timeout: 30_000 });
  }

  await page.goto("/app/pending?kind=reminder");
  await page.waitForLoadState("networkidle");
  for (const text of texts) await resolvePendingRow(page, t, page.locator(".row").filter({ hasText: text }));
  await page.screenshot({ path: `e2e/artifacts/pending-resolve/after-${info.project.name}.png`, fullPage: true });

  // The rows were hidden optimistically; a fresh load proves the server resolved them.
  await page.reload();
  for (const text of texts) await expect(page.locator(".row").filter({ hasText: text })).toHaveCount(0);
});

/** Drops the browser's own "request failed while offline" lines logged since `from`. */
function allowOfflineFetchErrors(problems: string[], from: number) {
  for (let i = problems.length - 1; i >= from; i -= 1) {
    if (problems[i] === "console.error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED") problems.splice(i, 1);
  }
}

test("a failed resolve brings the row back with the error", async ({ page, context, consoleGuard }, info) => {
  const t = dictionaries.en;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "en");
  await loginAs(page, "resident");
  await openTestPartida(page, t);

  const text = `Resolve offline ${info.project.name} ${Date.now()}`;
  await fillAndSubmit(page, t, text, sdLocalInput(2));
  await expect(sealedCard(page, text)).toBeVisible({ timeout: 30_000 });

  await page.goto("/app/pending?kind=reminder");
  await page.waitForLoadState("networkidle");
  const row = page.locator(".row").filter({ hasText: text });
  const resolve = row.getByRole("button", { name: t.pendingWork.resolve, exact: true });

  const offlineFrom = consoleGuard.problems.length;
  await context.setOffline(true);
  await resolve.click();
  await expect(row.getByRole("alert")).toHaveText(t.pendingWork.resolveError);
  await expect(resolve).toBeEnabled();
  await page.screenshot({ path: `e2e/artifacts/pending-resolve/error-${info.project.name}.png`, fullPage: true });

  await context.setOffline(false);
  allowOfflineFetchErrors(consoleGuard.problems, offlineFrom);
  await resolvePendingRow(page, t, row);
  await page.reload();
  await expect(row).toHaveCount(0);
});
