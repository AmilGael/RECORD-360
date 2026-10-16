import { expect, type Page } from "@playwright/test";
import { dictionaries } from "../../src/i18n/dictionaries";

export type E2ERole = "admin" | "resident";

const ENV_KEYS: Record<E2ERole, { email: string; password: string }> = {
  admin: { email: "E2E_ADMIN_EMAIL", password: "E2E_ADMIN_PASSWORD" },
  resident: { email: "E2E_RESIDENT_EMAIL", password: "E2E_RESIDENT_PASSWORD" },
};

/** Matches either locale's label exactly, so helpers work whatever r360_lang is. */
function eitherLang(pick: (t: (typeof dictionaries)["es"]) => string): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(${escape(pick(dictionaries.es))}|${escape(pick(dictionaries.en))})`);
}

export function credentialsFor(role: E2ERole): { email: string; password: string } {
  const keys = ENV_KEYS[role];
  const email = process.env[keys.email];
  const password = process.env[keys.password];
  if (!email || !password) {
    throw new Error(
      `Missing ${keys.email} or ${keys.password}. Add them to web/.env.e2e.local (real local accounts).`,
    );
  }
  return { email, password };
}

/** Signs in through the real /login form and waits for the app shell. */
export async function loginAs(page: Page, role: E2ERole): Promise<void> {
  const { email, password } = credentialsFor(role);
  await page.goto("/login");
  await page.getByPlaceholder(eitherLang((t) => t.login.email)).fill(email);
  await page.getByPlaceholder(eitherLang((t) => t.login.password)).fill(password);
  await page.getByRole("button", { name: eitherLang((t) => t.login.submit) }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app") || url.searchParams.has("error"));
  if (!new URL(page.url()).pathname.startsWith("/app")) {
    throw new Error(`Login as ${role} was rejected. Check the ${role} credentials in web/.env.e2e.local.`);
  }
}

/** Signs out via the sidebar, opening the phone drawer first when it is collapsed. */
export async function signOut(page: Page): Promise<void> {
  const openMenu = page.getByRole("button", { name: eitherLang((t) => t.sidebar.openMenu) });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole("button", { name: eitherLang((t) => t.sidebar.signOut) }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("button", { name: eitherLang((t) => t.login.submit) })).toBeVisible();
}
