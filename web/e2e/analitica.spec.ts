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

function firstCount(text: string): number {
  const m = text.match(/\d+/);
  expect(m, `summary has a number: ${text}`).not.toBeNull();
  return Number(m![0]);
}

async function openAnalitica(page: Page, t: (typeof dictionaries)["es"]) {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const href = await obra.getAttribute("href");
  if (!href) throw new Error("obra has no href");
  await page.goto(`${href}?tab=analitica`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(t.project.analiticaGeneral, { exact: true })).toBeVisible();
}

async function assertChartTablesMatchSummaries(page: Page, viewData: string) {
  const charts = page.locator("section.analitica-chart");
  const n = await charts.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const chart = charts.nth(i);
    const summary = chart.locator(".analitica-chart-summary");
    if (await summary.count() === 0) continue;
    const text = ((await summary.textContent()) ?? "").trim();
    const expected = firstCount(text);
    const disclosure = chart.getByText(viewData, { exact: true });
    await expect(disclosure).toBeVisible();
    await disclosure.click();
    const cells = chart.locator("table tbody td.mono");
    await expect(cells.first()).toBeVisible();
    const values = await cells.allTextContents();
    const sum = values.map((v) => Number(v.trim())).reduce((a, b) => a + b, 0);
    expect(sum, `Ver datos of "${text}"`).toBe(expected);
  }
}

for (const lang of langs) {
  const t = dictionaries[lang];
  for (const theme of themes) {
    test(`Analítica charts, plates and no horizontal scroll (${lang}, ${theme})`, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      await loginAs(page, "admin");
      await openAnalitica(page, t);

      await expect(page.getByRole("heading", { name: t.project.analitica.weeklyTitle })).toBeVisible();
      await expect(page.getByText(t.project.analiticaByBloque, { exact: true })).toBeVisible();
      await assertChartTablesMatchSummaries(page, t.project.analitica.viewData);

      if (info.project.name === "phone") {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "no horizontal scroll at 390").toBeLessThanOrEqual(0);
      }

      await mkdir("e2e/artifacts/analitica", { recursive: true });
      await page.screenshot({
        path: `e2e/artifacts/analitica/${lang}-${theme}-${info.project.name}.png`,
        fullPage: true,
      });
    });
  }
}
