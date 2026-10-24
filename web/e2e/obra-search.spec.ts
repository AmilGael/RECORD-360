import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, startsWith } from "./helpers/partida";

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];

test.use({ timezoneId: "America/Santo_Domingo" });

async function openObra(page: Page) {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const href = await obra.getAttribute("href");
  if (!href) throw new Error("obra has no href");
  await page.goto(href);
  await page.waitForLoadState("networkidle");
}

for (const lang of langs) {
  const t = dictionaries[lang];
  for (const theme of themes) {
    test(`obra search, Volver, and close-block error (${lang}, ${theme})`, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      await loginAs(page, "admin");
      await openObra(page);

      const box = page.getByPlaceholder(t.project.searchObra);
      await expect(box).toBeVisible();
      await page.evaluate(() => { (window as Window & { __r360?: number }).__r360 = 1; });

      let searches = 0;
      page.on("request", (req) => {
        if (req.url().includes("/api/projects/") && req.url().includes("/search?")) searches += 1;
      });
      await box.pressSequentially("Coci", { delay: 30 });
      await expect(page.getByText(t.project.searchNoResults, { exact: true }).or(page.locator(".search-hit").first())).toBeVisible();
      await page.waitForTimeout(400);
      expect(searches, "one search per debounce window").toBe(1);
      expect(await page.evaluate(() => (window as Window & { __r360?: number }).__r360)).toBe(1);
      await expect(page).toHaveURL(/[?&]q=Coci/);

      await page.getByRole("button", { name: t.nav.backAria }).click();
      await page.waitForURL((url) => url.pathname === "/app");
      expect(new URL(page.url()).searchParams.has("q")).toBe(false);

      await openObra(page);
      const again = page.getByPlaceholder(t.project.searchObra);
      await again.fill("Pruebas");
      await expect(page).toHaveURL(/[?&]q=Pruebas/);
      const hit = page.locator(".search-hit").first();
      await expect(hit).toBeVisible();
      const hitHref = await hit.getAttribute("href");
      if (!hitHref) throw new Error("search hit has no href");
      await page.goto(hitHref);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: t.nav.backAria }).click();
      await page.waitForURL(/[?&]q=Pruebas/);

      const bloque = page.getByRole("link", { name: t.project.openBloque }).first();
      await expect(bloque).toBeVisible();
      const bloqueHref = await bloque.getAttribute("href");
      expect(bloqueHref).toContain("block=");
      expect(bloqueHref ?? "").not.toContain("q=");
      await page.goto(bloqueHref!);
      await page.waitForLoadState("networkidle");
      const landed = new URL(page.url());
      expect(landed.searchParams.has("block")).toBe(true);
      expect(landed.searchParams.has("q")).toBe(false);

      await openObra(page);
      const names = ["Cocina", "Lavandería", "Sala"];
      let closed = false;
      for (const name of names) {
        const card = page.locator(".card", { hasText: name }).first();
        const button = card.getByRole("button", { name: t.lifecycle.closeBlock });
        if (await button.count() === 0) continue;
        await button.click();
        await expect(card.getByRole("alert")).toHaveText(t.serverErrors.blockHasOpenPartidas);
        closed = true;
        break;
      }
      expect(closed, "a bloque with open partidas").toBe(true);

      if (info.project.name === "phone") {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "no horizontal scroll at 390").toBeLessThanOrEqual(0);
      }

      await mkdir("e2e/artifacts/q11-search", { recursive: true });
      await page.screenshot({
        path: `e2e/artifacts/q11-search/${lang}-${theme}-${info.project.name}.png`,
        fullPage: true,
      });
    });
  }
}
