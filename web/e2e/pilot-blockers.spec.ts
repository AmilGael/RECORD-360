import { randomBytes } from "node:crypto";
import { test, expect } from "./helpers/guards";
import { credentialsFor, loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];
const shot = (name: string, project: string) => `e2e/artifacts/pilot-${name}-${project}.png`;
const randomCuid = () => `c${randomBytes(16).toString("hex").slice(0, 24)}`;

/**
 * Drops React #419 page errors raised since `from`. Call it only after the
 * same page has shown the app's 404 heading; every other problem still fails.
 * Next 15.5 streams the /app shell through /app/loading.tsx before notFound()
 * resolves, React recovers the boundary on the client, and Next reports the
 * recovery as an error. The user-visible result is the correct 404 page.
 * Revisit when Next is upgraded.
 */
function allowNotFoundRecovery(problems: string[], from: number) {
  for (let i = problems.length - 1; i >= from; i -= 1) {
    if (problems[i].startsWith("pageerror: ") && problems[i].includes("Minified React error #419")) problems.splice(i, 1);
  }
}

for (const lang of langs) {
  const t = dictionaries[lang];

  test(`admin logs in with the email typed in uppercase (${lang})`, async ({ page }) => {
    const { email, password } = credentialsFor("admin");
    await setLang(page, lang);
    await page.goto("/login");
    await page.getByPlaceholder(t.login.email).fill(email.toUpperCase());
    await page.getByPlaceholder(t.login.password).fill(password);
    await page.getByRole("button", { name: t.login.submit }).click();
    await page.waitForURL((url) => url.pathname === "/app");
    await expect(page.getByRole("heading", { level: 1, name: t.dash.title })).toBeVisible();
  });

  for (const theme of themes) {
    // A made-up address per run, never an E2E account: a locked real account
    // would break every parallel spec for 15 minutes.
    test(`the 6th failed login shows the lockout message and a reset link (${lang}, ${theme})`, async ({ page }, testInfo) => {
      const email = `lockout-${Date.now()}-${testInfo.project.name}-${lang}-${theme}@raphel.test`;
      // Reduced motion skips the .reveal fade-in, so screenshots show the settled form.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        await page.goto("/login");
        await page.getByPlaceholder(t.login.email).fill(email);
        await page.getByPlaceholder(t.login.password).fill("wrong-password-123");
        await page.getByRole("button", { name: t.login.submit }).click();
        await page.waitForURL((url) => url.searchParams.has("error"));
        // Next's route announcer is also role=alert, so pick the login alert by its text.
        if (attempt < 6) {
          await expect(page.getByRole("alert").filter({ hasText: t.login.error })).toBeVisible();
        } else {
          const alert = page.getByRole("alert").filter({ hasText: t.login.locked });
          await expect(alert).toBeVisible();
          await expect(alert.getByRole("link", { name: t.login.forgot })).toHaveAttribute("href", "/forgot-password");
        }
      }
      await page.screenshot({ path: shot(`lockout-${lang}-${theme}`, testInfo.project.name), fullPage: true });
    });

    test(`unknown obra and partida ids show the app 404 page (${lang}, ${theme})`, async ({ page, consoleGuard }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      await loginAs(page, "admin");
      for (const path of [`/app/projects/${randomCuid()}`, `/app/partidas/${randomCuid()}`]) {
        const firstNew = consoleGuard.problems.length;
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: t.errors.notFoundTitle })).toBeVisible();
        allowNotFoundRecovery(consoleGuard.problems, firstNew);
        await expect(page.getByText(t.errors.title)).toHaveCount(0);
        await expect(page.getByRole("link", { name: t.errors.backToApp })).toHaveAttribute("href", "/app");
        const kind = path.includes("partidas") ? "partida" : "obra";
        await page.screenshot({ path: shot(`404-${kind}-${lang}-${theme}`, testInfo.project.name), fullPage: true });
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, "no horizontal scroll").toBe(false);
    });
  }
}
