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

    // The card grid scrolls with the page (the preview is a sheet now).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));

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

test("phone: the last of 300 cards opens a full-screen sheet; closing returns to the workspace @load", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "full-screen sheet is phone");
  test.setTimeout(180_000);
  const host = assertLocalDatabase();
  expect(["localhost", "127.0.0.1"]).toContain(host);

  const db = new PrismaClient();
  const seeded = await seedCarga(db);
  try {
    await openCarga(page, seeded.firstName);
    const workspace = new URL(page.url());
    await selectPartida(page, seeded.lastName);
    const dialog = page.getByRole("dialog", { name: seeded.lastName });
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("sheet or viewport has no size");
    expect(Math.round(box.width)).toBe(viewport.width);
    await page.screenshot({ path: "e2e/artifacts/partida-panel/sheet-phone-300.png" });

    // Scoped to the dialog: the backdrop outside it carries the same label.
    await dialog.getByRole("button", { name: dictionaries.es.project.panelClose, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("block")).toBe(workspace.searchParams.get("block"));

    await page.evaluate(() => window.scrollTo(0, 0));
    const volver = page.getByRole("button", { name: dictionaries.es.nav.backAria });
    await expect(volver).toBeVisible();
    await volver.click();
    await expect(page).not.toHaveURL(/[?&]block=/);
  } finally {
    const removed = await removeCarga(db);
    expect(removed).toBeGreaterThanOrEqual(300);
    expect(await cargaRemaining(db)).toBe(0);
    await db.$disconnect();
  }
});
