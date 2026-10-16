import { test as base, expect, type Page } from "@playwright/test";

export type ConsoleGuard = { problems: string[]; assertClean: () => void };

/**
 * Records console errors, uncaught page errors and CSP violations. The CSP
 * listener runs inside the page because Playwright has no first-class event for
 * securitypolicyviolation.
 */
export async function attachConsoleGuard(page: Page): Promise<ConsoleGuard> {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  await page.exposeFunction("__e2eReportCsp", (detail: string) => problems.push(`csp: ${detail}`));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const report = (window as unknown as { __e2eReportCsp: (d: string) => void }).__e2eReportCsp;
      report(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} on ${e.documentURI}`);
    });
  });
  return {
    problems,
    assertClean: () => expect(problems, "console errors, page errors or CSP violations").toEqual([]),
  };
}

/** `test` with the console guard attached to every page and asserted at teardown. */
export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ page }, use) => {
      const guard = await attachConsoleGuard(page);
      await use(guard);
      guard.assertClean();
    },
    { auto: true },
  ],
});

export { expect };
