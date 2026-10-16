import { test, type Page } from "@playwright/test";
import type { Lang } from "../../src/i18n/dictionaries";

// Same cookie names and values the app's own switchers write:
// language-switcher.tsx / i18n/server.ts (r360_lang) and theme-switcher.tsx /
// app/layout.tsx (r360_theme, where "dark" is night shift and "light" is day).
export type Theme = "dark" | "light";

async function setCookie(page: Page, name: string, value: string) {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("baseURL is not configured in playwright.config.ts");
  await page.context().addCookies([{ name, value, url, sameSite: "Lax" }]);
}

export async function setLang(page: Page, lang: Lang): Promise<void> {
  await setCookie(page, "r360_lang", lang);
}

export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await setCookie(page, "r360_theme", theme);
}
