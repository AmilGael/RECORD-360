import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs, signOut } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import {
  PARTIDA,
  fillAndSubmit,
  openTestPartida,
  resolvePendingRow,
  sdLocalInput,
  sealedCard,
  escapeRe,
} from "./helpers/partida";

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];
const TITLE = `Recordatorio resuelto: ${PARTIDA}`;

test.use({ timezoneId: "America/Santo_Domingo" });

function sectionName(template: string, count: number | string = "\\d+") {
  const countSource = typeof count === "number" ? String(count) : count;
  return new RegExp(`^${escapeRe(template).replace("\\{count\\}", countSource)}$`);
}

async function openDrawerIfNeeded(page: Page, t: (typeof dictionaries)["es"]) {
  const openMenu = page.getByRole("button", { name: t.sidebar.openMenu });
  if (await openMenu.isVisible()) await openMenu.click();
}

async function closeDrawerIfNeeded(page: Page, t: (typeof dictionaries)["es"]) {
  const closeMenu = page.getByRole("button", { name: t.sidebar.closeMenu });
  if (await closeMenu.isVisible()) await closeMenu.click();
}

async function sidebarUnread(page: Page, t: (typeof dictionaries)["es"]): Promise<number> {
  await openDrawerIfNeeded(page, t);
  const link = page.getByRole("link", { name: new RegExp(`^${escapeRe(t.nav.notifications)}`) });
  const pill = link.locator(".sidebar-pill");
  const n = (await pill.count()) === 0 ? 0 : Number((await pill.textContent())?.trim());
  await closeDrawerIfNeeded(page, t);
  return n;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

async function markAllRead(page: Page, t: (typeof dictionaries)["es"]) {
  await page.goto("/app/notifications");
  await settle(page);
  const markAll = page.getByRole("button", { name: t.notifications.markAllRead });
  if ((await markAll.count()) === 0) return;
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await markAll.click();
  expect((await posted).status()).toBe(200);
  await expect(page.getByRole("heading", { name: sectionName(t.notifications.unreadSection, 0) })).toBeVisible();
}

for (const lang of langs) {
  const t = dictionaries[lang];

  for (const theme of themes) {
    test(`unread and read sections, open marks read (${lang}, ${theme})`, async ({ page }, info) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      await mkdir("e2e/artifacts/notifications-sections", { recursive: true });
      const shot = (name: string) =>
        `e2e/artifacts/notifications-sections/${lang}-${theme}-${info.project.name}-${name}.png`;

      await loginAs(page, "resident");
      await markAllRead(page, t);
      await signOut(page);

      await loginAs(page, "admin");
      await openTestPartida(page, t);
      const run = `${info.project.name} ${lang} ${theme} ${Date.now()}`;
      const texts = [1, 2].map((n) => `Q6 aviso ${n} ${run}`);
      for (const [i, text] of texts.entries()) {
        await fillAndSubmit(page, t, text, sdLocalInput(2 + i));
        await expect(sealedCard(page, text)).toBeVisible({ timeout: 30_000 });
      }
      await page.goto("/app/pending?kind=reminder");
      await settle(page);
      for (const text of texts) {
        await resolvePendingRow(page, t, page.locator(".row").filter({ hasText: text }));
      }

      await signOut(page);
      await loginAs(page, "resident");
      await page.goto("/app/notifications?type=reminder.resolved");
      await settle(page);

      const unreadTwo = page.getByRole("region", { name: sectionName(t.notifications.unreadSection, 2) });
      await expect(unreadTwo).toBeVisible({ timeout: 30_000 });
      const unreadLink = unreadTwo.getByRole("link", { name: TITLE });
      await expect(unreadLink).toHaveCount(2);

      const rows = unreadTwo.locator(".notif-row");
      await rows.nth(1).scrollIntoViewIfNeeded();
      await expect(unreadLink).toHaveCount(2);
      await page.screenshot({ path: shot("unread"), fullPage: true });

      const badgeBefore = await sidebarUnread(page, t);
      expect(badgeBefore).toBeGreaterThanOrEqual(2);

      await page.evaluate(() => {
        (window as unknown as { __r360Keep?: number }).__r360Keep = 1;
      });
      const markReadPost = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
      await unreadLink.first().click();
      await expect(page).toHaveURL(/\/app\/partidas\//);
      await expect(page.getByRole("heading", { level: 1, name: PARTIDA })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __r360Keep?: number }).__r360Keep)).toBe(1);
      await markReadPost;

      await page.goBack();
      await expect(page).toHaveURL(/\/app\/notifications/);
      await expect(page.getByRole("heading", { level: 1, name: t.notifications.title })).toBeVisible();
      const unreadOne = page.getByRole("region", { name: sectionName(t.notifications.unreadSection, 1) });
      const readRegion = page.getByRole("region", { name: sectionName(t.notifications.readSection) });
      await expect(unreadOne.getByRole("link", { name: TITLE })).toHaveCount(1);
      await expect(readRegion.getByRole("link", { name: TITLE }).first()).toBeVisible();
      await page.screenshot({ path: shot("after-back"), fullPage: true });

      await expect.poll(async () => sidebarUnread(page, t)).toBe(badgeBefore - 1);
    });
  }
}
