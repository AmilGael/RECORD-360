import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";

// Q2: typed reminder times and displayed times follow America/Santo_Domingo
// whatever zone the browser is in. Every registro written here goes to ONE
// partida ("Pruebas automáticas" in bloque Sala of the demo obra) so the demo
// partidas stay clean; each test resolves the reminder it created.
// Run: E2E_PROD=1 npx playwright test e2e/app-timezone.spec.ts --workers=1

const OBRA = "E2E Obra Demo";
const BLOQUE = "Sala";
const PARTIDA = "Pruebas automáticas";
const SD = "America/Santo_Domingo";
const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const startsWith = (s: string) => new RegExp(`^${escape(s)}`);
const shot = (name: string, info: TestInfo) => `e2e/artifacts/app-timezone/${name}-${info.project.name}.png`;

/** Wall-clock parts of an instant in a zone. */
function wall(instant: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant)) p[type] = value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** The UTC instant of a wall time in a zone, from the zone's offset at that moment. */
function wallInstant(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const offsetName = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(guess).find((p) => p.type === "timeZoneName")!.value; // "GMT+02:00" or "GMT"
  const offset = offsetName === "GMT" ? "+00:00" : offsetName.slice(3);
  return new Date(`${date}T${time}:00${offset}`);
}

/** How a record time must read in Santo Domingo, e.g. "18 oct 2026, 9:00 GMT-4". */
function sdText(instant: Date, lang: Lang): RegExp {
  const s = new Intl.DateTimeFormat(lang, {
    timeZone: SD, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset",
  }).format(instant);
  // Intl may put narrow no-break spaces before AM/PM; match any whitespace.
  return new RegExp(escape(s).replace(/\s/g, "\\s"));
}

/** Follows a link by its href: a click racing hydration can be swallowed. */
async function follow(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole("link", { name }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`link ${name} has no href`);
  await page.goto(href);
  await page.waitForLoadState("networkidle");
}

async function openTestPartida(page: Page, t: (typeof dictionaries)["es"]): Promise<void> {
  await page.goto("/app");
  await follow(page, startsWith(OBRA));
  await follow(page, startsWith(BLOQUE));
  const partidaForm = page.locator(`input[placeholder="${t.project.newPartida}"]:visible`).first();
  await expect(partidaForm).toBeVisible();
  const partidaLink = page.getByRole("link", { name: startsWith(PARTIDA) });
  if ((await partidaLink.count()) === 0) {
    await partidaForm.fill(PARTIDA);
    await page.getByRole("button", { name: t.project.add, exact: true }).click();
    await expect(partidaLink.first()).toBeVisible();
  }
  await follow(page, startsWith(PARTIDA));
  await follow(page, startsWith(t.project.openLog));
  await expect(page.getByRole("heading", { level: 1, name: PARTIDA })).toBeVisible();
}

async function submitRegistro(page: Page, t: (typeof dictionaries)["es"], text: string, reminder: string): Promise<void> {
  await page.locator(`textarea[placeholder="${t.composer.placeholder}"]:visible`).first().fill(text);
  await page.locator('input[name="reminderDueAt"]:visible').first().fill(reminder);
  await page.getByRole("button", { name: startsWith(t.composer.submit) }).click();
  await expect(page.getByRole("status").filter({ hasText: t.composer.saved })).toBeVisible();
}

/** Finds the reminder on the pending queue, checks its due time, then resolves it. */
async function checkAndResolvePending(page: Page, t: (typeof dictionaries)["es"], text: string, due: RegExp, name: string, info: TestInfo) {
  await page.goto("/app/pending?kind=reminder");
  await page.waitForLoadState("networkidle");
  const row = page.locator(".row").filter({ hasText: text });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${t.pendingWork.dueLabel}:`);
  await expect(row).toContainText(due);
  await expect(row).toContainText("GMT-4");
  await page.screenshot({ path: shot(name, info), fullPage: true });
  const resolve = row.getByRole("button", { name: t.pendingWork.resolve, exact: true });
  // Prove the resolution persisted with a fresh load once the server action
  // has answered; the in-place refresh after the action is not under test here.
  const actionDone = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await resolve.click();
  expect((await actionDone).status()).toBe(200);
  await page.reload();
  await expect(page.locator(".row").filter({ hasText: text })).toHaveCount(0);
}

async function prepare(page: Page, lang: Lang, theme: Theme = "dark") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, lang);
  await setTheme(page, theme);
}

test.describe("browser in Santo Domingo", () => {
  test.use({ timezoneId: SD });

  for (const lang of langs) {
    const t = dictionaries[lang];

    test(`a reminder 2 h ahead keeps its typed time with GMT-4 (${lang})`, async ({ page }, info) => {
      await prepare(page, lang);
      await loginAs(page, "resident");
      await openTestPartida(page, t);
      const typed = wall(new Date(Date.now() + 2 * 3_600_000), SD);
      const text = `TZ e2e online ${lang} ${info.project.name} ${Date.now()}`;
      await submitRegistro(page, t, text, `${typed.date}T${typed.time}`);
      const card = page.locator(".card").filter({ hasText: text }).filter({ hasText: "HASH" });
      await expect(card).toContainText("GMT-4");
      await checkAndResolvePending(page, t, text, sdText(wallInstant(typed.date, typed.time, SD), lang), `sd-online-${lang}`, info);
    });

    test(`an offline reminder syncs with the same typed time (${lang})`, async ({ page, context }, info) => {
      await prepare(page, lang);
      await loginAs(page, "resident");
      await openTestPartida(page, t);
      const typed = wall(new Date(Date.now() + 2 * 3_600_000), SD);
      const text = `TZ e2e offline ${lang} ${info.project.name} ${Date.now()}`;
      await context.setOffline(true);
      await submitRegistro(page, t, text, `${typed.date}T${typed.time}`);
      await expect(page.getByText(t.offlineCapture.pendingOne).first()).toBeVisible();
      await context.setOffline(false);
      await expect(page.locator(".card").filter({ hasText: text }).filter({ hasText: "HASH" })).toContainText("GMT-4", { timeout: 30_000 });
      await checkAndResolvePending(page, t, text, sdText(wallInstant(typed.date, typed.time, SD), lang), `sd-offline-${lang}`, info);
    });
  }
});

test.describe("browser in Madrid", () => {
  test.use({ timezoneId: "Europe/Madrid" });

  for (const lang of langs) {
    const t = dictionaries[lang];

    test(`typing 15:00 Madrid time shows the Santo Domingo equivalent (${lang})`, async ({ page }, info) => {
      await prepare(page, lang);
      await loginAs(page, "resident");
      await openTestPartida(page, t);
      const tomorrow = wall(new Date(Date.now() + 24 * 3_600_000), "Europe/Madrid").date;
      const instant = wallInstant(tomorrow, "15:00", "Europe/Madrid");
      // While Madrid is on summer time (UTC+2) 15:00 there is 09:00 in Santo Domingo.
      if (wall(instant, "UTC").time === "13:00") expect(wall(instant, SD).time).toBe("09:00");
      const text = `TZ e2e madrid ${lang} ${info.project.name} ${Date.now()}`;
      await submitRegistro(page, t, text, `${tomorrow}T15:00`);
      // "Saved" means queued on the device; leaving before the upload lands
      // would only defer it to the next page load.
      await expect(page.locator(".card").filter({ hasText: text }).filter({ hasText: "HASH" })).toContainText("GMT-4");
      await checkAndResolvePending(page, t, text, sdText(instant, lang), `madrid-${lang}`, info);
    });
  }
});

test.describe("record cards and notifications", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  for (const lang of langs) {
    for (const theme of themes) {
      const t = dictionaries[lang];

      test(`show GMT-4 times (${lang}, ${theme})`, async ({ page }, info) => {
        await prepare(page, lang, theme);
        await loginAs(page, "admin");
        await page.goto("/app/notifications");
        await expect(page.getByRole("heading", { level: 1, name: t.notifications.title })).toBeVisible();
        const firstTime = page.locator(".row").first().locator("p.text-steel").last();
        await expect(firstTime).toContainText("GMT-4");
        await page.screenshot({ path: shot(`notifications-${lang}-${theme}`, info), fullPage: true });

        await openTestPartida(page, t);
        const firstCard = page.locator(".card").filter({ hasText: "HASH" }).first();
        await expect(firstCard).toContainText("GMT-4");
        const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(width, "no horizontal scroll").toBeLessThanOrEqual(0);
        await page.screenshot({ path: shot(`partida-cards-${lang}-${theme}`, info), fullPage: true });
      });
    }
  }
});
