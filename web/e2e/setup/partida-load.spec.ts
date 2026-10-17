import { PrismaClient } from "@prisma/client";
import { test, expect } from "../helpers/guards";
import { loginAs } from "../helpers/auth";
import { setLang } from "../helpers/prefs";
import { OBRA, selectPartida, startsWith } from "../helpers/partida";
import { assertLocalDatabase, cargaRemaining, removeCarga, seedCarga } from "./carga-load";

const prisma = new PrismaClient();

test("300 partidas in Carga stay scrollable and selectable @load", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "volume check on desktop");
  test.setTimeout(180_000);
  const host = assertLocalDatabase();
  expect(["localhost", "127.0.0.1"]).toContain(host);

  const seeded = await seedCarga(prisma);
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setLang(page, "es");
    await loginAs(page, "admin");
    await page.goto("/app");
    await page.getByRole("link", { name: startsWith(OBRA) }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: startsWith("Carga") }).click();
    await page.waitForURL(/[?&]block=/);
    await expect(page.getByRole("button", { name: startsWith(seeded.firstName) })).toBeVisible();

    const list = page.locator(".workspace-list");
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await list.evaluate((el) => { el.scrollTop = 0; });

    const start = Date.now();
    await selectPartida(page, seeded.firstName);
    const openMs = Date.now() - start;
    console.log(`panel open ${openMs}ms`);
    expect(openMs, "panel open stays under 1s at 300 rows").toBeLessThan(1000);
    await expect(page.getByRole("heading", { level: 2, name: seeded.firstName })).toBeVisible();
    await page.screenshot({ path: "e2e/artifacts/partida-panel/load-300.png", fullPage: true });
  } finally {
    const removed = await removeCarga(prisma);
    expect(removed).toBeGreaterThanOrEqual(300);
    expect(await cargaRemaining(prisma)).toBe(0);
    await prisma.$disconnect();
  }
});
