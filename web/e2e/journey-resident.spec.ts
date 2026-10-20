import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme } from "./helpers/prefs";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  BLOQUE,
  OBRA,
  PARTIDA,
  escapeRe,
  follow,
  resolvePendingRow,
  sdLocalInput,
  selectPartida,
  startsWith,
} from "./helpers/partida";
import { assertNoHorizontalOverflow, assertServerClean, collectServerErrors } from "./helpers/watch";

// Q10 phone journey, Spanish, night. One resident session on E2E Obra Demo.
// The first registro is online (text, a photo, a reminder). The second is
// queued offline. Both must seal once, and the reminder's shown time must
// still be the Santo Domingo time that was typed.

const SD = "America/Santo_Domingo";
const t = dictionaries.es;
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const TITLE = `Recordatorio resuelto: ${PARTIDA}`;

test.use({ timezoneId: SD });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "phone", "the resident journey is the phone project");
});

function wallInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const offsetName = new Intl.DateTimeFormat("en", { timeZone: SD, timeZoneName: "longOffset" })
    .formatToParts(guess).find((p) => p.type === "timeZoneName")!.value;
  const offset = offsetName === "GMT" ? "+00:00" : offsetName.slice(3);
  return new Date(`${date}T${time}:00${offset}`);
}

/** How formatRecordTime renders that instant in Spanish. */
function sdText(instant: Date): RegExp {
  const s = new Intl.DateTimeFormat("es", {
    timeZone: SD, year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset",
  }).format(instant);
  return new RegExp(escapeRe(s).replace(/\s/g, "\\s"));
}

/** Browser and Next prefetch noise while the radio is off. Anything else still fails. */
function allowOfflineNoise(problems: string[], from: number) {
  for (let i = problems.length - 1; i >= from; i -= 1) {
    const p = problems[i];
    if (p === "console.error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED") problems.splice(i, 1);
    else if (p.startsWith("console.error: Failed to fetch RSC payload") && p.includes("TypeError: Failed to fetch")) problems.splice(i, 1);
  }
}

function sectionName(template: string, count?: number) {
  const countSource = count === undefined ? "\\d+" : String(count);
  return new RegExp(`^${escapeRe(template).replace("\\{count\\}", countSource)}$`);
}

async function shot(page: Page, name: string) {
  await mkdir("e2e/artifacts/journey-resident", { recursive: true });
  await page.screenshot({ path: `e2e/artifacts/journey-resident/${name}.png`, fullPage: true });
}

async function markAllRead(page: Page) {
  await page.goto("/app/notifications");
  await page.waitForLoadState("networkidle");
  const markAll = page.getByRole("button", { name: t.notifications.markAllRead });
  if ((await markAll.count()) === 0) return;
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await markAll.click();
  expect((await posted).status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { name: sectionName(t.notifications.unreadSection, 0) })).toBeVisible();
}

test("resident: capture, offline sync, reminder, volver, notifications, planos", async ({ page, consoleGuard }) => {
  test.setTimeout(240_000);
  const serverErrors = collectServerErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "es");
  await setTheme(page, "dark");
  const stamp = `${Date.now()}`;
  const onlineText = `Q10 en línea ${stamp}`;
  const offlineText = `Q10 sin señal ${stamp}`;
  const dir = path.join("e2e", "artifacts", "journey-resident");
  await mkdir(dir, { recursive: true });
  const pngPath = path.join(dir, `q10-${stamp}.png`);
  await writeFile(pngPath, PNG_1x1);

  await loginAs(page, "resident");
  await expect(page.getByRole("heading", { level: 1, name: t.dash.title })).toBeVisible();
  await assertNoHorizontalOverflow(page, "Obras");
  await markAllRead(page);

  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  await follow(page, startsWith(OBRA));
  await expect(page.getByRole("heading", { level: 1, name: OBRA })).toBeVisible();
  const obraPath = new URL(page.url()).pathname;
  await assertNoHorizontalOverflow(page, "obra");

  await follow(page, startsWith(BLOQUE));
  await selectPartida(page, PARTIDA);
  await expect(page.getByRole("heading", { level: 2, name: PARTIDA })).toBeVisible();
  await shot(page, "panel");
  await assertNoHorizontalOverflow(page, "bloque with panel");

  // A real tap. Specs that goto the href do it because a Link click can be
  // swallowed; this journey is required to click and to stop if that happens.
  const nuevo = page.getByRole("link", { name: t.project.newRegistro });
  await expect(nuevo).toBeVisible();
  await nuevo.click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/partidas\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: PARTIDA })).toBeVisible();
  await expect(page.locator("#composer")).toBeVisible();

  const typed = sdLocalInput(2);
  const [date, time] = typed.split("T");
  await page.locator(`textarea[placeholder="${t.composer.placeholder}"]`).fill(onlineText);
  await page.locator('input[name="photos"]').setInputFiles(pngPath);
  await page.locator('input[name="reminderDueAt"]').fill(typed);
  await page.getByRole("button", { name: startsWith(t.composer.submit) }).click();
  const onlineCard = page.locator(".card").filter({ hasText: onlineText }).filter({ hasText: "HASH" });
  await expect(onlineCard).toBeVisible({ timeout: 45_000 });
  const photo = onlineCard.locator("img");
  await expect(photo).toBeVisible();
  await expect.poll(async () => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const offlineFrom = consoleGuard.problems.length;
  await page.context().setOffline(true);
  await page.locator(`textarea[placeholder="${t.composer.placeholder}"]`).fill(offlineText);
  await page.getByRole("button", { name: startsWith(t.composer.submit) }).click();
  await expect(page.getByRole("status").filter({ hasText: t.composer.savedOnDevice })).toBeVisible();
  await expect(page.getByText(t.offlineCapture.pendingOne).first()).toBeVisible();
  await shot(page, "on-device");

  await page.context().setOffline(false);
  const offlineCard = page.locator(".card").filter({ hasText: offlineText }).filter({ hasText: "HASH" });
  await expect(offlineCard).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("status").filter({ hasText: t.composer.savedOnDevice })).toHaveCount(0);
  await expect(page.getByText(t.offlineCapture.pendingOne)).toHaveCount(0);
  await expect(page.getByText(onlineText, { exact: true })).toHaveCount(1);
  await expect(page.getByText(offlineText, { exact: true })).toHaveCount(1);
  allowOfflineNoise(consoleGuard.problems, offlineFrom);
  await shot(page, "synced");
  await assertNoHorizontalOverflow(page, "partida after sync");

  await page.goto("/app/pending?kind=reminder");
  await page.waitForLoadState("networkidle");
  const row = page.locator(".row").filter({ hasText: onlineText });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${t.pendingWork.dueLabel}:`);
  await expect(row).toContainText(sdText(wallInstant(date, time)));
  await expect(row).toContainText("GMT-4");
  await shot(page, "reminder");
  await resolvePendingRow(page, t, row);

  const back = page.getByRole("button", { name: t.nav.backAria });
  for (let i = 0; i < 3 && !onObra(page.url(), obraPath); i++) {
    await expect(back).toBeVisible();
    const before = page.url();
    await back.click({ timeout: 20_000 });
    await expect.poll(() => page.url(), { timeout: 20_000 }).not.toBe(before);
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname.startsWith("/app"), `Volver left the app at ${page.url()}`).toBe(true);
  }
  expect(onObra(page.url(), obraPath), `Volver did not reach the obra in 3 taps (${page.url()})`).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: OBRA })).toBeVisible();
  await assertNoHorizontalOverflow(page, "obra after Volver");

  await page.goto("/app/notifications");
  await page.waitForLoadState("networkidle");
  const unread = page.getByRole("region", { name: sectionName(t.notifications.unreadSection) });
  await expect(unread).toBeVisible();
  const unreadLink = unread.getByRole("link", { name: TITLE });
  const unreadBefore = await unreadLink.count();
  expect(unreadBefore).toBeGreaterThan(0);
  await unreadLink.first().click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/partidas\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: PARTIDA })).toBeVisible();
  await page.getByRole("button", { name: t.nav.backAria }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/notifications/);
  await expect(page.getByRole("region", { name: sectionName(t.notifications.unreadSection) }).getByRole("link", { name: TITLE })).toHaveCount(unreadBefore - 1);
  await expect(page.getByRole("region", { name: sectionName(t.notifications.readSection) }).getByRole("link", { name: TITLE }).first()).toBeVisible();
  await shot(page, "notifications");
  await assertNoHorizontalOverflow(page, "Notificaciones");

  await page.goto(`${obraPath}?tab=planos`);
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("searchbox", { name: t.planos.search });
  await search.fill("electr");
  const plano = page.getByRole("link", { name: /Eléctrica/ }).first();
  await expect(plano).toBeVisible();
  const thumb = plano.locator("img");
  await expect(thumb).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await shot(page, "planos");
  await assertNoHorizontalOverflow(page, "Planos");
  assertServerClean(serverErrors);
});

function onObra(url: string, obraPath: string): boolean {
  const u = new URL(url);
  return u.pathname === obraPath && !u.searchParams.has("block");
}
