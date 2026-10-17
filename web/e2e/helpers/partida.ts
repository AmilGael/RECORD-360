import type { Locator, Page } from "@playwright/test";
import { expect } from "./guards";
import type { dictionaries } from "../../src/i18n/dictionaries";

// Every registro written by e2e goes to ONE partida ("Pruebas automáticas" in
// bloque Sala of the demo obra) so the demo partidas stay clean.
export const OBRA = "E2E Obra Demo";
export const BLOQUE = "Sala";
export const PARTIDA = "Pruebas automáticas";

export type T = (typeof dictionaries)["es"];

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const startsWith = (s: string) => new RegExp(`^${escapeRe(s)}`);

/** Follows a link by its href: a click racing hydration can be swallowed. */
export async function follow(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole("link", { name }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`link ${name} has no href`);
  await page.goto(href);
  await page.waitForLoadState("networkidle");
}

/** Opens the e2e partida's Cuaderno, creating the partida in bloque Sala on first use. */
export async function openTestPartida(page: Page, t: T): Promise<void> {
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

/** Fills and submits the composer; the caller asserts the outcome. */
export async function fillAndSubmit(page: Page, t: T, text: string, reminder?: string): Promise<void> {
  await page.locator(`textarea[placeholder="${t.composer.placeholder}"]:visible`).first().fill(text);
  if (reminder) await page.locator('input[name="reminderDueAt"]:visible').first().fill(reminder);
  await page.getByRole("button", { name: startsWith(t.composer.submit) }).click();
}

/** The sealed record card for `text` (only server-accepted registros show a HASH). */
export function sealedCard(page: Page, text: string) {
  return page.locator(".card").filter({ hasText: text }).filter({ hasText: "HASH" });
}

/**
 * Clicks a pending row's Resolve and waits for the server action to answer.
 * The row hides optimistically on click, so a reload before the answer would
 * race the action itself.
 */
export async function resolvePendingRow(page: Page, t: T, row: Locator): Promise<void> {
  const resolve = row.getByRole("button", { name: t.pendingWork.resolve, exact: true });
  await expect(resolve).toBeEnabled();
  const answered = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await resolve.click();
  await expect(row).toHaveCount(0);
  expect((await answered).status()).toBe(200);
}

/** A datetime-local value `hours` from now in Santo Domingo wall time. */
export function sdLocalInput(hours: number): string {
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(Date.now() + hours * 3_600_000))) p[type] = value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
