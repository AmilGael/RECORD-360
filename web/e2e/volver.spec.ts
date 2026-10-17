import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { BLOQUE, OBRA, PARTIDA, fillAndSubmit, startsWith, type T } from "./helpers/partida";

// Q3 part A: Volver returns to the screen the user came from, inside the app,
// and falls back to the page's parent when there is no in-app history.
// Navigation uses real clicks after the page settles, so the trail records
// client-side navigation the way a user produces it. Only the correction
// test writes, and only to "Pruebas automáticas".

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];
const COCINA = "Cocina";
const COCINA_PARTIDA = "Instalación eléctrica";

async function prepare(page: Page, lang: Lang, theme: Theme = "dark") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, lang);
  await setTheme(page, theme);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

const here = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};

/**
 * Follows a link by its href. A client-side <Link> click can hang when the
 * bundled react-dom drops a ping during render (react/react#37805); the trail
 * still records a goto because NavTrail watches the location.
 */
async function clickLink(page: Page, name: RegExp | string) {
  const link = page.getByRole("link", { name }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`link ${name} has no href`);
  await page.goto(href);
  await settle(page);
}

/** Clicks Volver and waits until it has left the current screen. */
async function volver(page: Page, t: T) {
  const from = here(page);
  await page.getByRole("button", { name: t.nav.backAria }).click();
  await page.waitForURL((u) => u.pathname + u.search !== from);
  await settle(page);
}

/** Dashboard → obra → bloque → partida in the workspace → its Cuaderno. Returns the ids from the URLs. */
async function walkToPartida(page: Page, t: T, bloque: string, partida: string) {
  await page.goto("/app");
  await settle(page);
  await clickLink(page, startsWith(OBRA));
  await expect(page).toHaveURL(/\/app\/projects\/[^/?]+/);
  const obraUrl = new URL(page.url());
  await clickLink(page, startsWith(bloque));
  const blockId = new URL(page.url()).searchParams.get("block");
  expect(blockId).toBeTruthy();
  await clickLink(page, startsWith(partida));
  await expect(page.getByRole("heading", { level: 2, name: partida })).toBeVisible();
  const workspaceUrl = new URL(page.url());
  await clickLink(page, startsWith(t.project.openLog));
  await expect(page.getByRole("heading", { level: 1, name: partida })).toBeVisible();
  const partidaId = new URL(page.url()).pathname.split("/").pop()!;
  return { obraPath: obraUrl.pathname, workspaceUrl, blockId: blockId!, partidaId };
}

async function noHorizontalScroll(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(width, "no horizontal scroll").toBeLessThanOrEqual(0);
}

for (const lang of langs) {
  const t = dictionaries[lang];

  for (const theme of themes) {
    test(`obra → ${COCINA} → partida → Volver lands on the ${COCINA} workspace with it selected (${lang}, ${theme})`, async ({ page }, info) => {
      await prepare(page, lang, theme);
      await loginAs(page, "resident");
      const { obraPath, blockId, partidaId } = await walkToPartida(page, t, COCINA, COCINA_PARTIDA);

      const crumbs = page.getByRole("navigation", { name: t.breadcrumb.aria });
      await expect(crumbs.getByRole("link", { name: COCINA })).toBeVisible();
      await expect(page.getByRole("button", { name: t.nav.backAria })).toHaveText(t.nav.back);
      await noHorizontalScroll(page);
      await page.screenshot({ path: `e2e/artifacts/volver/partida-${lang}-${theme}-${info.project.name}.png`, fullPage: true });

      await volver(page, t);
      const back = new URL(page.url());
      expect(back.pathname).toBe(obraPath);
      expect(back.searchParams.get("block")).toBe(blockId);
      expect(back.searchParams.get("p")).toBe(partidaId);
      await expect(page.getByRole("heading", { level: 2, name: COCINA_PARTIDA })).toBeVisible();
      await page.screenshot({ path: `e2e/artifacts/volver/workspace-${lang}-${theme}-${info.project.name}.png`, fullPage: true });
    });
  }

  test(`a partida opened by direct URL in a new tab goes back to its bloque (${lang})`, async ({ page, context }) => {
    await prepare(page, lang);
    await loginAs(page, "resident");
    const { obraPath, blockId, partidaId } = await walkToPartida(page, t, COCINA, COCINA_PARTIDA);

    // A new tab starts with an empty trail, like a link opened from WhatsApp.
    const tab = await context.newPage();
    await tab.emulateMedia({ reducedMotion: "reduce" });
    await tab.goto(`/app/partidas/${partidaId}`);
    await settle(tab);
    await volver(tab, t);
    const back = new URL(tab.url());
    expect(back.pathname).toBe(obraPath);
    expect(back.searchParams.get("block")).toBe(blockId);
    expect(back.searchParams.get("p")).toBe(partidaId);
    await tab.close();
  });

  test(`Planos → Analítica → Volver lands on Planos (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "resident");
    await page.goto("/app");
    await settle(page);
    await clickLink(page, startsWith(OBRA));
    await clickLink(page, t.project.tabPlanos);
    await expect(page.getByRole("link", { name: t.project.tabPlanos })).toHaveAttribute("aria-current", "page");
    await clickLink(page, t.project.tabAnalytics);
    await expect(page.getByRole("link", { name: t.project.tabAnalytics })).toHaveAttribute("aria-current", "page");
    await volver(page, t);
    expect(new URL(page.url()).searchParams.get("tab")).toBe("planos");
    await expect(page.getByRole("link", { name: t.project.tabPlanos })).toHaveAttribute("aria-current", "page");
  });

  test(`browser back once, then Volver keeps going back (no ping-pong) (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "resident");
    const { obraPath, workspaceUrl } = await walkToPartida(page, t, COCINA, COCINA_PARTIDA);

    await page.goBack();
    await settle(page);
    expect(page.url()).toBe(workspaceUrl.href);
    await volver(page, t);
    const atObra = new URL(page.url());
    expect(atObra.pathname).toBe(obraPath);
    expect(atObra.searchParams.get("block")).toBeNull();
    await volver(page, t);
    expect(new URL(page.url()).pathname).toBe("/app");
  });

  test(`after a correction, Volver returns to the screen before the partida (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "resident");
    const { obraPath, blockId, partidaId } = await walkToPartida(page, t, BLOQUE, PARTIDA);

    const correct = lang === "es" ? "Corregir" : "Correct";
    await page.getByRole("link", { name: correct, exact: true }).first().click();
    await expect(page).toHaveURL(/correctionOf=/);
    const text = `Volver tras corregir ${lang} ${Date.now()}`;
    await fillAndSubmit(page, t, text);
    await expect(page).not.toHaveURL(/correctionOf=/);
    await expect(page.locator(".card").filter({ hasText: text }).filter({ hasText: "HASH" })).toBeVisible({ timeout: 30_000 });

    await volver(page, t);
    const back = new URL(page.url());
    expect(back.pathname).toBe(obraPath);
    expect(back.searchParams.get("block")).toBe(blockId);
    expect(back.searchParams.get("p")).toBe(partidaId);
  });

  test(`notifications → partida → Volver returns to notifications (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "resident");
    await page.goto("/app/notifications");
    await settle(page);
    // Resolving the e2e reminders notifies their author, so the resident always has one.
    await page.getByRole("link", { name: new RegExp(PARTIDA) }).first().click();
    await expect(page).toHaveURL(/\/app\/partidas\//);
    await settle(page);
    await volver(page, t);
    expect(new URL(page.url()).pathname).toBe("/app/notifications");
  });
}
