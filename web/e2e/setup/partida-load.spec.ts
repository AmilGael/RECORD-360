import { PrismaClient } from "@prisma/client";
import { test, expect } from "../helpers/guards";
import { loginAs } from "../helpers/auth";
import { setLang } from "../helpers/prefs";
import { dictionaries } from "../../src/i18n/dictionaries";
import { OBRA, follow, selectPartida, startsWith } from "../helpers/partida";
import { assertLocalDatabase, cargaRemaining, removeCarga, seedCarga } from "./carga-load";

const prisma = new PrismaClient();

async function openCarga(page: Parameters<typeof loginAs>[0], firstName: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "es");
  await loginAs(page, "admin");
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
  await follow(page, startsWith("Carga"));
  await expect(page).toHaveURL(/[?&]block=/);
  await expect(page.getByRole("button", { name: startsWith(firstName) })).toBeVisible({ timeout: 30_000 });
}

test("300 partidas in Carga stay scrollable and selectable @load", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "volume check on desktop");
  test.setTimeout(180_000);
  const host = assertLocalDatabase();
  expect(["localhost", "127.0.0.1"]).toContain(host);

  const seeded = await seedCarga(prisma);
  try {
    await openCarga(page, seeded.firstName);

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

test("phone: last row and Volver stay above the open sheet @load", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "sheet overlap is phone");
  test.setTimeout(180_000);
  const host = assertLocalDatabase();
  expect(["localhost", "127.0.0.1"]).toContain(host);

  const db = new PrismaClient();
  const seeded = await seedCarga(db);
  try {
    await openCarga(page, seeded.firstName);
    await selectPartida(page, seeded.firstName);
    await expect(page.locator(".workspace.is-sheet-open")).toBeVisible();

    const last = page.getByRole("button", { name: startsWith(seeded.lastName) }).first();
    await last.evaluate((el) => {
      const panel = document.querySelector(".workspace-panel.is-open");
      const sheetTop = panel instanceof HTMLElement
        ? panel.getBoundingClientRect().top
        : window.innerHeight * 0.45;
      window.scrollBy(0, el.getBoundingClientRect().bottom - sheetTop + 8);
    });
    await expect.poll(async () => page.evaluate((name) => {
      const row = [...document.querySelectorAll("button.tree-file")].find((el) => (el.textContent ?? "").includes(name));
      const panel = document.querySelector(".workspace-panel.is-open");
      if (!row || !panel) return false;
      const rb = row.getBoundingClientRect();
      const pb = panel.getBoundingClientRect();
      return rb.bottom <= pb.top + 1 && rb.top >= 0;
    }, seeded.lastName)).toBe(true);
    const rowBox = await last.boundingBox();
    if (!rowBox) throw new Error("last row has no box");
    await page.mouse.click(rowBox.x + Math.min(40, rowBox.width / 2), rowBox.y + Math.min(12, rowBox.height / 2));
    await expect(page.getByRole("heading", { level: 2, name: seeded.lastName })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    const volver = page.getByRole("button", { name: dictionaries.es.nav.backAria });
    await expect(volver).toBeVisible();
    const backBox = await volver.boundingBox();
    if (!backBox) throw new Error("Volver has no box");
    await page.mouse.click(backBox.x + backBox.width / 2, backBox.y + backBox.height / 2);
    await expect(page).not.toHaveURL(/[?&]block=/);
    await page.screenshot({ path: "e2e/artifacts/partida-panel/sheet-space-phone.png", fullPage: true });
  } finally {
    const removed = await removeCarga(db);
    expect(removed).toBeGreaterThanOrEqual(300);
    expect(await cargaRemaining(db)).toBe(0);
    await db.$disconnect();
  }
});
