import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { fillAndSubmit, openTestPartida, sealedCard } from "./helpers/partida";

// Q3 part C: the composer says where the registro is — on this phone until
// the server takes it, then recorded and sealed. Registros go to "Pruebas
// automáticas" only.

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];

async function prepare(page: Page, lang: Lang, theme: Theme) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, lang);
  await setTheme(page, theme);
}

for (const lang of langs) {
  const t = dictionaries[lang];

  test(`online: the composer confirms the registro is recorded and sealed (${lang})`, async ({ page }, info) => {
    await prepare(page, lang, "dark");
    await loginAs(page, "resident");
    await openTestPartida(page, t);
    const text = `Captura en línea ${lang} ${info.project.name} ${Date.now()}`;
    await fillAndSubmit(page, t, text);
    const sealed = page.getByRole("status").filter({ hasText: t.composer.savedSealed });
    await expect(sealed).toBeVisible({ timeout: 30_000 });
    await expect(sealedCard(page, text)).toBeVisible();
    await expect(sealed).toHaveCount(0, { timeout: 10_000 });
  });

  for (const theme of themes) {
    test(`offline: saved on this phone, then sealed after reconnecting (${lang}, ${theme})`, async ({ page, context }, info) => {
      await prepare(page, lang, theme);
      await loginAs(page, "resident");
      await openTestPartida(page, t);
      const text = `Captura sin señal ${lang} ${theme} ${info.project.name} ${Date.now()}`;

      await context.setOffline(true);
      await fillAndSubmit(page, t, text);
      const onDevice = page.getByRole("status").filter({ hasText: t.composer.savedOnDevice });
      await expect(onDevice).toBeVisible();
      await expect(page.getByText(t.offlineCapture.pendingOne).first()).toBeVisible();
      await page.screenshot({ path: `e2e/artifacts/capture-status/on-device-${lang}-${theme}-${info.project.name}.png`, fullPage: true });

      await context.setOffline(false);
      const sealed = page.getByRole("status").filter({ hasText: t.composer.savedSealed });
      await expect(sealed).toBeVisible({ timeout: 30_000 });
      await expect(onDevice).toHaveCount(0);
      await page.screenshot({ path: `e2e/artifacts/capture-status/sealed-${lang}-${theme}-${info.project.name}.png`, fullPage: true });
      await expect(sealedCard(page, text)).toBeVisible({ timeout: 30_000 });
    });
  }
}
