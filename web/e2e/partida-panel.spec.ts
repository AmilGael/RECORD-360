import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, createPartidaInWorkspace, selectPartida, startsWith, type T } from "./helpers/partida";

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];
const BLOQUE = "Cocina";
const PARTIDA_A = "Instalación eléctrica";
const PARTIDA_B = "Plomería y desagües";

async function prepare(page: Page, lang: Lang, theme: Theme = "dark") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, lang);
  await setTheme(page, theme);
}

async function openBloque(page: Page, t: T) {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const obraHref = await obra.getAttribute("href");
  if (!obraHref) throw new Error("obra has no href");
  await page.goto(obraHref);
  await page.waitForLoadState("networkidle");
  const bloque = page.getByRole("link", { name: startsWith(BLOQUE) }).first();
  await expect(bloque).toBeVisible();
  const bloqueHref = await bloque.getAttribute("href");
  if (!bloqueHref) throw new Error("bloque has no href");
  await page.goto(bloqueHref);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(`input[placeholder="${t.project.newPartida}"]:visible`).first()).toBeVisible();
}

async function watchSkel(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __skelSeen?: boolean }).__skelSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(".skel")) {
        (window as unknown as { __skelSeen?: boolean }).__skelSeen = true;
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
}

for (const lang of langs) {
  const t = dictionaries[lang];

  for (const theme of themes) {
    test(`tap opens the panel beside the list (${lang}, ${theme})`, async ({ page }, info) => {
      await prepare(page, lang, theme);
      await loginAs(page, "admin");
      await openBloque(page, t);
      await watchSkel(page);
      const start = Date.now();
      await selectPartida(page, PARTIDA_A);
      expect(Date.now() - start, "panel visible within 1s").toBeLessThan(1000);
      await expect(page.getByRole("button", { name: startsWith(PARTIDA_B) })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __skelSeen?: boolean }).__skelSeen)).toBeFalsy();
      await expect(page.locator(".skel")).toHaveCount(0);
      await page.screenshot({ path: `e2e/artifacts/partida-panel/open-${lang}-${theme}-${info.project.name}.png`, fullPage: true });
    });
  }

  test(`switching partidas then back once closes the panel (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await selectPartida(page, PARTIDA_A);
    await selectPartida(page, PARTIDA_B);
    await expect(page.getByRole("heading", { level: 2, name: PARTIDA_B })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 2, name: PARTIDA_B })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("p")).toBeNull();
  });

  test(`Nuevo registro focuses the composer (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await selectPartida(page, PARTIDA_A);
    const link = page.getByRole("link", { name: t.project.newRegistro }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Nuevo registro has no href");
    await page.goto(href);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#composer textarea")).toBeFocused();
  });

  test(`a concluded partida has no progress input (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    const name = `Q4 concluida ${lang} ${Date.now()}`;
    await createPartidaInWorkspace(page, t, name);
    await selectPartida(page, name);
    const partidaId = new URL(page.url()).searchParams.get("p");
    const progressInput = page.locator(`#panel-progress-${partidaId}`);
    await page.getByRole("button", { name: t.lifecycle.concludePartida }).click();
    await expect(page.getByText(`${t.lifecycle.concluded} · 100%`)).toBeVisible();
    await expect(progressInput).toHaveCount(0);
    await page.getByRole("button", { name: t.lifecycle.reopenPartida }).click();
    await expect(progressInput).toBeVisible();
  });

  test(`progress save updates the panel and the row (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    const name = `Q4 avance ${lang} ${Date.now()}`;
    await createPartidaInWorkspace(page, t, name);
    await selectPartida(page, name);
    const partidaId = new URL(page.url()).searchParams.get("p");
    const input = page.locator(`#panel-progress-${partidaId}`);
    await input.fill("37");
    await page.locator(".workspace-panel").getByRole("button", { name: t.project.save, exact: true }).click();
    await expect(page.getByRole("button", { name: startsWith(name) })).toContainText("37%");
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    await expect(input).toHaveValue("37");
  });
}

test("desktop list and panel are equal width; swapping rows does not load a document", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "equal-column check is desktop");
  await prepare(page, "es");
  await loginAs(page, "admin");
  await openBloque(page, dictionaries.es);
  await selectPartida(page, PARTIDA_A);
  const list = page.locator(".workspace-list");
  const panel = page.locator(".workspace-panel");
  const lb = await list.boundingBox();
  const pb = await panel.boundingBox();
  expect(lb && pb, "both columns visible").toBeTruthy();
  expect(Math.abs((lb?.width ?? 0) - (pb?.width ?? 0)), "columns within 2px").toBeLessThanOrEqual(2);

  const documents: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "document") documents.push(req.url());
  });
  await selectPartida(page, PARTIDA_B);
  await expect(page.getByRole("heading", { level: 2, name: PARTIDA_B })).toBeVisible();
  expect(documents, "no document request while swapping partidas").toEqual([]);
  await page.screenshot({ path: `e2e/artifacts/partida-panel/desktop-es-${info.project.name}.png`, fullPage: true });
});
