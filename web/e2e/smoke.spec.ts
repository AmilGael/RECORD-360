import { test, expect } from "./helpers/guards";
import { loginAs, signOut, type E2ERole } from "./helpers/auth";
import { setLang } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";

const roles: E2ERole[] = ["admin", "resident"];
const langs: Lang[] = ["es", "en"];

for (const role of roles) {
  for (const lang of langs) {
    test(`${role} logs in, sees Obras, signs out (${lang})`, async ({ page }, testInfo) => {
      const t = dictionaries[lang];
      await setLang(page, lang);
      await loginAs(page, role);

      await expect(page.getByRole("heading", { level: 1, name: t.dash.title })).toBeVisible();
      await page.screenshot({
        path: `e2e/artifacts/smoke-${role}-${lang}-${testInfo.project.name}.png`,
        fullPage: true,
      });

      await signOut(page);
    });
  }
}
