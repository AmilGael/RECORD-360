import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, createPartidaInWorkspace, selectPartida, startsWith, type T } from "./helpers/partida";

// The partida preview opens in the side sheet (components/sheet.tsx): a
// right-hand panel from 640px up, the whole screen below. `?p=` names the open
// partida; the sheet owns one history entry, so Back closes it in place.

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

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });

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
    test(`a card opens the preview sheet titled with the partida (${lang}, ${theme})`, async ({ page }, info) => {
      await prepare(page, lang, theme);
      await loginAs(page, "admin");
      await openBloque(page, t);
      await watchSkel(page);
      const start = Date.now();
      await selectPartida(page, PARTIDA_A);
      expect(Date.now() - start, "sheet visible within 1s").toBeLessThan(1000);
      await expect(sheet(page, PARTIDA_A)).toBeVisible();
      await expect(sheet(page, PARTIDA_A).getByRole("link", { name: t.project.openCuaderno })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __skelSeen?: boolean }).__skelSeen)).toBeFalsy();
      await expect(page.locator(".skel")).toHaveCount(0);

      const box = await sheet(page, PARTIDA_A).boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport) throw new Error("sheet or viewport has no size");
      if (info.project.name === "phone") {
        expect(Math.round(box.width), "full-screen on the phone").toBe(viewport.width);
        expect(Math.round(box.height)).toBe(viewport.height);
      } else {
        expect(box.width, "a side panel on desktop").toBeLessThan(viewport.width / 2);
        expect(Math.round(box.x + box.width)).toBe(viewport.width);
      }
      await page.screenshot({ path: `e2e/artifacts/partida-panel/open-${lang}-${theme}-${info.project.name}.png`, fullPage: true });
    });
  }

  test(`Escape closes the sheet and keeps the workspace (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    const workspace = new URL(page.url());
    await selectPartida(page, PARTIDA_A);
    await page.keyboard.press("Escape");
    await expect(sheet(page, PARTIDA_A)).toHaveCount(0);
    const after = new URL(page.url());
    expect(after.pathname).toBe(workspace.pathname);
    expect(after.searchParams.get("block")).toBe(workspace.searchParams.get("block"));
    expect(after.searchParams.get("p")).toBeNull();
    // Focus goes back to the card that opened it.
    await expect(page.getByRole("button", { name: startsWith(PARTIDA_A) })).toBeFocused();
  });

  test(`Back closes the sheet in place, keeping the search (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await page.getByPlaceholder(t.project.searchPartidas).fill("Plom");
    await expect(page).toHaveURL(/[?&]q=Plom/);
    await selectPartida(page, PARTIDA_B);
    await page.goBack();
    await expect(sheet(page, PARTIDA_B)).toHaveCount(0);
    const after = new URL(page.url());
    expect(after.searchParams.get("block"), "still in the bloque workspace").toBeTruthy();
    expect(after.searchParams.get("q")).toBe("Plom");
    expect(after.searchParams.get("p")).toBeNull();
    await expect(page.getByRole("button", { name: startsWith(PARTIDA_B) })).toBeVisible();

    // Opening another partida after closing still takes one Back to close.
    await page.getByPlaceholder(t.project.searchPartidas).fill("");
    await selectPartida(page, PARTIDA_A);
    await page.goBack();
    await expect(sheet(page, PARTIDA_A)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("block")).toBeTruthy();
  });

  test(`a ?p= deep link opens the sheet on load (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await selectPartida(page, PARTIDA_A);
    const deep = page.url();
    await page.goto("/app");
    await page.goto(deep);
    await page.waitForLoadState("networkidle");
    await expect(sheet(page, PARTIDA_A)).toBeVisible();
    await page.goBack();
    await expect(sheet(page, PARTIDA_A)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("block"), "Back from a deep link stays in the workspace").toBeTruthy();
  });

  test(`offline, the sheet shows the offline message (${lang})`, async ({ page, context }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await context.setOffline(true);
    try {
      await page.getByRole("button", { name: startsWith(PARTIDA_A) }).first().click();
      await expect(sheet(page, PARTIDA_A)).toBeVisible();
      await expect(sheet(page, PARTIDA_A).getByRole("alert")).toContainText(t.project.panelOffline);
    } finally {
      await context.setOffline(false);
    }
  });

  test(`Nuevo registro focuses the composer (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    await selectPartida(page, PARTIDA_A);
    const link = sheet(page, PARTIDA_A).getByRole("link", { name: t.project.newRegistro });
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
    await sheet(page, name).getByRole("button", { name: t.lifecycle.concludePartida }).click();
    await expect(page.getByText(`${t.lifecycle.concluded} · 100%`)).toBeVisible();
    await expect(progressInput).toHaveCount(0);
    await sheet(page, name).getByRole("button", { name: t.lifecycle.reopenPartida }).click();
    await expect(progressInput).toBeVisible();
  });

  test(`progress save updates the sheet and the card (${lang})`, async ({ page }) => {
    await prepare(page, lang);
    await loginAs(page, "admin");
    await openBloque(page, t);
    const name = `Q4 avance ${lang} ${Date.now()}`;
    await createPartidaInWorkspace(page, t, name);
    await selectPartida(page, name);
    const partidaId = new URL(page.url()).searchParams.get("p");
    const input = page.locator(`#panel-progress-${partidaId}`);
    await input.fill("37");
    await sheet(page, name).getByRole("button", { name: t.project.save, exact: true }).first().click();
    await expect(page.getByRole("button", { name: startsWith(name) })).toContainText("37%");
    await expect(sheet(page, name)).toBeVisible();
    await expect(input).toHaveValue("37");
  });
}

test("desktop: the card grid keeps the full width; swapping partidas loads no document", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "layout check is desktop");
  await prepare(page, "es");
  await loginAs(page, "admin");
  await openBloque(page, dictionaries.es);
  const grid = page.locator(".partida-grid");
  const workspace = page.locator(".workspace");
  const gb = await grid.boundingBox();
  const wb = await workspace.boundingBox();
  expect(gb && wb, "grid and workspace visible").toBeTruthy();
  expect((gb?.width ?? 0) / (wb?.width ?? 1), "no column held back for a preview").toBeGreaterThan(0.9);

  const documents: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "document") documents.push(req.url());
  });
  await selectPartida(page, PARTIDA_A);
  await page.keyboard.press("Escape");
  await selectPartida(page, PARTIDA_B);
  await expect(sheet(page, PARTIDA_B)).toBeVisible();
  expect(documents, "no document request while swapping partidas").toEqual([]);
  await page.screenshot({ path: `e2e/artifacts/partida-panel/desktop-es-${info.project.name}.png`, fullPage: true });
});
