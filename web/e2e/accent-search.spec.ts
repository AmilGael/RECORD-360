import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page, Request } from "@playwright/test";
import PDFDocument from "pdfkit";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, follow, startsWith } from "./helpers/partida";

const langs: Lang[] = ["es", "en"];
const PARTIDA = "Demolición de revestimientos";

test.use({ timezoneId: "America/Santo_Domingo" });

async function openObra(page: Page) {
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
}

async function writeTinyPdf(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 300], margin: 0 });
    const out = createWriteStream(filePath);
    doc.pipe(out);
    doc.rect(20, 20, 360, 260).fill("#336699");
    doc.end();
    out.on("finish", resolve);
    out.on("error", reject);
  });
}

for (const lang of langs) {
  const t = dictionaries[lang];

  test(`unaccented search finds accented names (${lang})`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setLang(page, lang);
    await loginAs(page, "admin");
    await openObra(page);
    const obraPath = new URL(page.url()).pathname;

    const obraSearch = page.getByPlaceholder(t.project.searchObra);
    await obraSearch.fill("demolicion");
    await expect(page.locator(".search-hit", { hasText: PARTIDA })).toBeVisible();

    await follow(page, startsWith("Cocina"));
    await expect(page).toHaveURL(/[?&]block=/);
    await page.evaluate(() => { (window as Window & { __r360?: number }).__r360 = 1; });
    let documents = 0;
    const onDocument = (req: Request) => {
      if (req.resourceType() === "document") documents += 1;
    };
    page.on("request", onDocument);
    await page.getByPlaceholder(t.project.searchPartidas).fill("demolicion");
    await expect(page.getByRole("button", { name: startsWith(PARTIDA) })).toBeVisible();
    await expect(page.getByRole("button", { name: startsWith("Gabinetes y encimera") })).toHaveCount(0);
    expect(documents).toBe(0);
    expect(await page.evaluate(() => (window as Window & { __r360?: number }).__r360)).toBe(1);
    page.off("request", onDocument);

    await page.goto(`${obraPath}?tab=planos`);
    await page.waitForLoadState("networkidle");
    const planos = page.getByRole("searchbox", { name: t.planos.search });
    await planos.fill("electrica");
    const hit = page.getByRole("link", { name: /Planta Eléctrica/ });
    if ((await hit.count()) === 0) {
      const dir = path.join("e2e", "artifacts", "accent");
      const pdfPath = path.join(dir, `Planta Eléctrica ${info.project.name}.pdf`);
      await writeTinyPdf(pdfPath);
      await page.locator('input[type="file"][name="file"]').setInputFiles(pdfPath);
      await page.getByRole("button", { name: t.planos.uploadByKind.PLANO }).click();
      await expect(page.getByRole("link", { name: /Planta Eléctrica/ }).first()).toBeVisible({ timeout: 60_000 });
      await page.getByRole("searchbox", { name: t.planos.search }).fill("electrica");
    }
    await expect(page.getByRole("link", { name: /Planta Eléctrica/ }).first()).toBeVisible();
    await expect(page.getByText(t.planos.searchEmpty)).toHaveCount(0);
  });
}
