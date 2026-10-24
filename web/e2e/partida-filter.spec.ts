import type { Page, Request } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, follow, selectPartida, startsWith } from "./helpers/partida";

const langs: Lang[] = ["es", "en"];
const MATCH = "Gabinetes y encimera";
const OTHER = "Demolición de revestimientos";
const HIDDEN_PANEL = "Plomería y desagües";

test.use({ timezoneId: "America/Santo_Domingo" });

async function openObra(page: Page) {
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
}

async function openCocina(page: Page) {
  await follow(page, startsWith("Cocina"));
  await expect(page).toHaveURL(/[?&]block=/);
  await expect(page.getByRole("button", { name: startsWith(MATCH) })).toBeVisible();
}

function mark(page: Page) {
  return page.evaluate(() => { (window as Window & { __r360?: number }).__r360 = 1; });
}

function marker(page: Page) {
  return page.evaluate(() => (window as Window & { __r360?: number }).__r360);
}

for (const lang of langs) {
  const t = dictionaries[lang];

  test(`partida name filter (${lang})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setLang(page, lang);
    await loginAs(page, "admin");
    await openObra(page);
    const obraPath = new URL(page.url()).pathname;
    await openCocina(page);
    await mark(page);

    let documents = 0;
    const onDocument = (req: Request) => {
      if (req.resourceType() === "document") documents += 1;
    };
    page.on("request", onDocument);

    const box = page.getByPlaceholder(t.project.searchPartidas);
    await box.pressSequentially("Gab", { delay: 20 });
    await expect(page.getByRole("button", { name: startsWith(MATCH) })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith(OTHER) })).toHaveCount(0);
    expect(documents, "typing does not load a document").toBe(0);
    expect(await marker(page)).toBe(1);

    await expect(page).toHaveURL(/[?&]q=Gab/);
    expect(documents, "replaceState does not load a document").toBe(0);
    expect(await marker(page)).toBe(1);
    page.off("request", onDocument);

    await box.fill("zzzzzz");
    await expect(page.getByText(t.project.noResults, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith(MATCH) })).toHaveCount(0);
    expect(await marker(page)).toBe(1);
    await expect(page).toHaveURL(/[?&]q=zzzzzz/);

    const filtered = page.url();
    await page.getByRole("button", { name: t.nav.backAria }).click();
    await page.waitForURL((url) => url.toString() !== filtered);
    const back = new URL(page.url());
    expect(back.pathname).toBe(obraPath);
    expect(back.searchParams.has("block"), "Volver leaves the list for the screen that opened it").toBe(false);
    expect(back.searchParams.has("q")).toBe(false);

    await openCocina(page);
    const deep = new URL(page.url());
    deep.searchParams.set("q", "Gab");
    const response = await page.goto(deep.toString());
    const html = await response?.text();
    if (!html) throw new Error("deep link returned no document");
    const rendered = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    expect(rendered).toContain(MATCH);
    expect(rendered).not.toContain(OTHER);
    await expect(page.getByRole("button", { name: startsWith(MATCH) })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith(OTHER) })).toHaveCount(0);

    const plain = new URL(page.url());
    plain.searchParams.delete("q");
    await page.goto(plain.toString());
    await expect(page.getByRole("button", { name: startsWith(OTHER) })).toBeVisible();

    const form = page.locator("form.tree-filter");
    await form.locator("summary").click();
    await form.locator('input[name="pmin"]').fill("0");
    await form.locator('input[name="q"]').fill("Gab");
    expect(new URL(page.url()).searchParams.get("q"), "facet submit happens before replaceState").toBeNull();
    await form.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
    const landed = new URL(page.url());
    expect(landed.searchParams.get("q")).toBe("Gab");
    expect(landed.searchParams.get("pmin")).toBe("0");
    await expect(page.getByRole("button", { name: startsWith(MATCH) })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith(OTHER) })).toHaveCount(0);

    await selectPartida(page, MATCH);
    await page.getByPlaceholder(t.project.searchPartidas).fill("Plom");
    await expect(page.getByRole("heading", { level: 2, name: MATCH })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith(MATCH) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: startsWith(HIDDEN_PANEL) })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("p")).toBeTruthy();
  });
}
