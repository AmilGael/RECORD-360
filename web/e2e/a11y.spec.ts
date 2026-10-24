import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries } from "../src/i18n/dictionaries";
import { BLOQUE, OBRA, PARTIDA, follow, selectPartida, startsWith } from "./helpers/partida";
import { assertNoHorizontalOverflow, assertServerClean, collectServerErrors } from "./helpers/watch";

// Smoke only. Serious and critical fail the run. Moderate issues are listed
// and left for a later pass — disabling a rule to go green is not a fix.

const t = dictionaries.es;
const themes: Theme[] = ["dark", "light"];

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

function line(where: string, v: Violation): string {
  const targets = v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" || ");
  return `${where} | ${v.impact} | ${v.id} | ${targets}`;
}

async function scan(page: Page, where: string): Promise<{ blocking: string[]; moderate: string[] }> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => line(where, v));
  const moderate = results.violations
    .filter((v) => v.impact === "moderate")
    .map((v) => line(where, v));
  return { blocking, moderate };
}

for (const theme of themes) {
  test(`axe on the demo screens (${theme})`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const serverErrors = collectServerErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setLang(page, "es");
    await setTheme(page, theme);
    await loginAs(page, "admin");

    const blocking: string[] = [];
    const moderate: string[] = [];
    async function check(where: string) {
      await assertNoHorizontalOverflow(page, where);
      const found = await scan(page, `${info.project.name} ${theme} ${where}`);
      blocking.push(...found.blocking);
      moderate.push(...found.moderate);
    }

    await expect(page.getByRole("heading", { level: 1, name: t.dash.title })).toBeVisible();
    await check("Obras");

    await follow(page, startsWith(OBRA));
    await follow(page, startsWith(BLOQUE));
    await selectPartida(page, PARTIDA);
    await expect(page.getByRole("heading", { level: 2, name: PARTIDA })).toBeVisible();
    await check("bloque with panel");

    const projectPath = new URL(page.url()).pathname;
    await page.goto(`${projectPath}?tab=planos`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("searchbox", { name: t.planos.search })).toBeVisible();
    await check("Planos");

    await page.goto("/app/notifications");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: t.notifications.title })).toBeVisible();
    await check("Notificaciones");

    await page.goto(`${projectPath}?tab=analitica`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: t.project.analitica.weeklyTitle })).toBeVisible();
    await check("Analítica");

    const body = moderate.length ? moderate.join("\n") : "(none)";
    await mkdir("e2e/artifacts/a11y", { recursive: true });
    await writeFile(`e2e/artifacts/a11y/moderate-${theme}-${info.project.name}.txt`, `${body}\n`);
    for (const item of moderate) info.annotations.push({ type: "moderate", description: item });
    expect(blocking, "serious or critical axe violations").toEqual([]);
    assertServerClean(serverErrors);
  });
}
