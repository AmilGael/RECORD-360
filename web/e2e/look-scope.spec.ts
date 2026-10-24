import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setTheme, type Theme } from "./helpers/prefs";
import { dictionaries } from "../src/i18n/dictionaries";

// Task 3: the original look is scoped to /app. The auth screens keep the
// current look from globals.css (square, chamfered buttons), while the /app
// wrapper carries the new tokens.

const themes: Theme[] = ["dark", "light"];
const submitName = new RegExp(`^(${dictionaries.es.login.submit}|${dictionaries.en.login.submit})`);

for (const theme of themes) {
  test(`/login keeps today's square, chamfered submit button (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto("/login");
    const submit = page.getByRole("button", { name: submitName });
    await expect(submit).toBeVisible();
    const look = await submit.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, clip: s.clipPath };
    });
    expect(look.radius).toBe("0px");
    expect(look.clip).toContain("polygon");
    expect(await page.locator(".raphel-app").count()).toBe(0);
  });

  test(`/app wrapper carries the scoped tokens and the sheet root (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await loginAs(page, "resident");
    await page.goto("/app");
    const wrapper = page.locator(".raphel-app");
    await expect(wrapper).toHaveCount(1);
    const tokens = await wrapper.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        radius: s.getPropertyValue("--radius").trim(),
        radiusSm: s.getPropertyValue("--radius-sm").trim(),
        paper: s.getPropertyValue("--paper").trim().toLowerCase(),
        backgroundSize: s.backgroundSize,
      };
    });
    expect(tokens.radius).toBe("10px");
    expect(tokens.radiusSm).toBe("6px");
    expect(tokens.paper).toBe(theme === "dark" ? "#171412" : "#ece7dd");
    expect(tokens.backgroundSize).toContain("14px 14px");
    await expect(page.locator(".raphel-app > #sheet-root:last-child")).toHaveCount(1);
  });
}
