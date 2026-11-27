import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { assertNoHorizontalOverflow } from "./helpers/watch";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { BLOQUE, OBRA, PARTIDA, expectWorkspaceReady, follow, selectPartida, startsWith } from "./helpers/partida";

// Project tabs are real routes under a shared layout. Runs on the phone
// (390px) and desktop projects: the five Spanish and English labels must fit
// without the page scrolling sideways (the strip slides instead).

const langs: Lang[] = ["es", "en"];
const ROUTES = [
  { id: "partidas", segment: "" },
  { id: "planos", segment: "/planos" },
  { id: "solicitudes", segment: "/solicitudes" },
  { id: "analitica", segment: "/analitica" },
  { id: "informes", segment: "/informes" },
] as const;

/** The demo obra's path (no query), from the obras list. */
async function obraPath(page: Page): Promise<string> {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const href = await obra.getAttribute("href");
  if (!href) throw new Error("obra has no href");
  return new URL(href, "http://localhost").pathname;
}

const here = (page: Page) => {
  const u = new URL(page.url());
  return { path: u.pathname, search: u.searchParams };
};

for (const lang of langs) {
  const t = dictionaries[lang];
  const labels = {
    partidas: t.project.tabPartidas,
    planos: t.project.tabPlanos,
    solicitudes: t.project.tabSolicitudes,
    analitica: t.project.tabAnalytics,
    informes: t.project.tabInformes,
  };

  test(`project tabs (${lang}): each tab is its route, one is current, no sideways scroll`, async ({ page }) => {
    await setLang(page, lang);
    await loginAs(page, "admin");
    const base = await obraPath(page);

    for (const route of ROUTES) {
      await page.goto(`${base}${route.segment}`);
      await page.waitForLoadState("networkidle");

      const strip = page.getByRole("navigation", { name: t.project.tabsLabel });
      await expect(strip).toBeVisible();
      const current = strip.locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(labels[route.id]);
      expect(here(page).path).toBe(`${base}${route.segment}`);
      await assertNoHorizontalOverflow(page, `${route.id} (${lang})`);
    }

    // Following each tab link from the strip lands on that route.
    await page.goto(base);
    await page.waitForLoadState("networkidle");
    for (const route of ROUTES) {
      const strip = page.getByRole("navigation", { name: t.project.tabsLabel });
      const link = strip.getByRole("link", { name: labels[route.id] });
      await link.scrollIntoViewIfNeeded();
      const href = await link.getAttribute("href");
      expect(href).toBe(`${base}${route.segment}`);
      await page.goto(href!);
      await page.waitForLoadState("networkidle");
      await expect(strip.locator('[aria-current="page"]')).toHaveText(labels[route.id]);
    }
  });
}

test("legacy ?tab= links land on the matching route and keep other params", async ({ page }) => {
  await loginAs(page, "admin");
  const base = await obraPath(page);

  await page.goto(`${base}?tab=cambios`);
  await page.waitForLoadState("networkidle");
  expect(here(page).path).toBe(`${base}/solicitudes`);
  expect(here(page).search.has("tab")).toBe(false);

  await page.goto(`${base}?tab=informes`);
  await page.waitForLoadState("networkidle");
  expect(here(page).path).toBe(`${base}/informes`);

  // A repeated tab uses its first value.
  await page.goto(`${base}?tab=planos&tab=analitica`);
  await page.waitForLoadState("networkidle");
  expect(here(page).path).toBe(`${base}/planos`);

  // An unknown value falls back to the Partidas index (and does not loop).
  await page.goto(`${base}?tab=zzz`);
  await page.waitForLoadState("networkidle");
  expect(here(page).path).toBe(base);
  expect(here(page).search.has("tab")).toBe(false);

  // The old Partidas link keeps the bloque and partida params. Use a real
  // partida: the workspace drops a `p` that names none. In the production build
  // the redirect runs in the browser (the page streams under loading.tsx), so
  // wait for the address bar to lose `tab`, then check what it kept.
  await setLang(page, "es");
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
  await follow(page, startsWith(BLOQUE));
  await expectWorkspaceReady(page, dictionaries.es);
  await selectPartida(page, PARTIDA);
  const opened = here(page).search;
  const block = opened.get("block");
  const partidaId = opened.get("p");
  expect(block).toBeTruthy();
  expect(partidaId).toBeTruthy();
  await page.goto(`${base}?tab=code&block=${block}&p=${partidaId}`);
  await page.waitForURL((url) => !url.searchParams.has("tab"));
  await expect(page.getByRole("heading", { level: 2, name: PARTIDA })).toBeVisible();
  expect(here(page).path).toBe(base);
  expect(here(page).search.get("block")).toBe(block);
  expect(here(page).search.get("p")).toBe(partidaId);
});

test("a foreign or missing project id is a 404 on every tab route", async ({ page, consoleGuard }) => {
  // Each 404 asked for here is logged by Chrome as a console error.
  consoleGuard.allow(/status of 404 \(Not Found\) \(http:\/\/[^/]+\/app\/projects\/does-not-exist[^)]*\)$/);
  await loginAs(page, "admin");
  for (const route of ROUTES) {
    const res = await page.goto(`/app/projects/does-not-exist${route.segment}`);
    expect(res?.status(), route.id).toBe(404);
  }
});
