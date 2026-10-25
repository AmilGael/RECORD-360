import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { BLOQUE, OBRA, follow, sdLocalInput, startsWith, type T } from "./helpers/partida";

// The three create forms (Nueva solicitud, Nueva partida, Nuevo bloque) open
// in the side sheet behind a button and close it once the record is created.
// Writes: one solicitud and one partida in bloque Sala per run; the throwaway
// bloque is closed, checked, reopened and deleted again.

const langs: Lang[] = ["es", "en"];

async function obraPath(page: Page): Promise<string> {
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
  return new URL(page.url()).pathname;
}

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

/** Waits for a server-action POST to answer. */
function actionAnswer(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
}

for (const lang of langs) {
  const t: T = dictionaries[lang];

  test(`Nueva solicitud opens in a sheet; the list stays on the page (${lang})`, async ({ page }) => {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 18.4861, longitude: -69.9312 });
    await setLang(page, lang);
    await loginAs(page, "admin");
    const base = await obraPath(page);
    await page.goto(`${base}/solicitudes`);
    await page.waitForLoadState("networkidle");

    // The form is not on the page until asked for; the list is.
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
    await page.getByRole("button", { name: t.changes.new }).click();
    const sheet = dialog(page, t.changes.new);
    await expect(sheet).toBeVisible();

    const title = `Solicitud en hoja ${lang} ${Date.now()}`;
    await sheet.getByRole("radio", { name: t.requests.kindChange }).check();
    await sheet.getByRole("radio", { name: t.requests.severityImportant }).check();
    await sheet.getByPlaceholder(t.changes.fieldTitle).fill(title);
    await sheet.locator('select[name="segmentIds"]').selectOption({ label: BLOQUE });
    await sheet.locator('input[name="reminderDueAt"]').fill(sdLocalInput(2));
    await expect(sheet.getByText(t.requests.gpsAcquired)).toBeVisible({ timeout: 15_000 });
    const submit = sheet.getByRole("button", { name: t.changes.new });
    await expect(submit).toBeEnabled();
    const answered = actionAnswer(page);
    await submit.click();
    expect((await answered).status()).toBeLessThan(500);

    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible({ timeout: 20_000 });
  });

  test(`Nueva partida opens in a sheet and creates the partida (${lang})`, async ({ page }) => {
    await setLang(page, lang);
    await loginAs(page, "admin");
    await obraPath(page);
    await follow(page, startsWith(BLOQUE));
    await expect(page.locator(`input[placeholder="${t.project.newPartida}"]`)).toHaveCount(0);

    await page.getByRole("button", { name: t.project.newPartidaButton, exact: true }).click();
    const sheet = dialog(page, t.project.newPartidaButton);
    await expect(sheet).toBeVisible();
    const name = `Partida en hoja ${lang} ${Date.now()}`;
    await sheet.getByPlaceholder(t.project.newPartida).fill(name);
    const answered = actionAnswer(page);
    await sheet.getByRole("button", { name: t.project.add, exact: true }).click();
    expect((await answered).status()).toBe(200);

    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: startsWith(name) }).first()).toBeVisible({ timeout: 20_000 });
  });

  test(`Nuevo bloque opens in a sheet; a closed bloque offers no Nueva partida (${lang})`, async ({ page }) => {
    await setLang(page, lang);
    await loginAs(page, "admin");
    const base = await obraPath(page);

    await page.getByRole("button", { name: t.project.newBloque, exact: true }).click();
    const sheet = dialog(page, t.project.newBloque);
    await expect(sheet).toBeVisible();
    const name = `Bloque hoja ${lang} ${Date.now()}`;
    await sheet.getByPlaceholder(t.project.newSegment).fill(name);
    const created = actionAnswer(page);
    await sheet.getByRole("button", { name: t.project.add, exact: true }).click();
    expect((await created).status()).toBe(200);
    await expect(sheet).toHaveCount(0);

    const card = page.locator(".card").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 20_000 });
    try {
      // Close it, then its workspace keeps the existing no-create message.
      const closed = actionAnswer(page);
      await card.getByRole("button", { name: t.lifecycle.closeBlock }).click();
      expect((await closed).status()).toBe(200);
      await expect(card.getByText(t.lifecycle.blockClosed)).toBeVisible();
      await follow(page, startsWith(name));
      await expect(page.getByText(t.lifecycle.blockClosedNoCreate)).toBeVisible();
      await expect(page.getByRole("button", { name: t.project.newPartidaButton, exact: true })).toHaveCount(0);
    } finally {
      await page.goto(base);
      await page.waitForLoadState("networkidle");
      const reopen = card.getByRole("button", { name: t.lifecycle.reopenBlock });
      if (await reopen.count()) {
        const reopened = actionAnswer(page);
        await reopen.click();
        await reopened;
      }
      await card.getByRole("button", { name: t.project.deleteBloque }).click();
      await card.getByRole("button", { name: t.project.yes, exact: true }).click();
      await expect(page.locator(".card").filter({ hasText: name })).toHaveCount(0, { timeout: 20_000 });
    }
  });
}
