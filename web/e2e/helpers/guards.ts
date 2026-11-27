import { test as base, expect, type Page } from "@playwright/test";

export type ConsoleGuard = {
  problems: string[];
  /** Lets a spec accept errors it causes on purpose (a 404 it asks for, requests it makes fail offline). */
  allow: (pattern: RegExp) => void;
  assertClean: () => void;
};

/**
 * Records console errors, uncaught page errors and CSP violations. The CSP
 * listener runs inside the page because Playwright has no first-class event for
 * securitypolicyviolation.
 */
export async function attachConsoleGuard(page: Page): Promise<ConsoleGuard> {
  const problems: string[] = [];
  const allowed: RegExp[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Chrome's "...responded with a status of 404" line does not say which
    // resource; add it, so a spec can allow one specific expected 404. Network
    // errors (net::ERR_*) keep their exact text, which other specs match on.
    const url = /^Failed to load resource: the server responded with a status of/.test(msg.text()) ? msg.location().url : "";
    problems.push(`console.error: ${msg.text()}${url ? ` (${url})` : ""}`);
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
    allow: (pattern) => { allowed.push(pattern); },
    assertClean: () => expect(
      problems.filter((p) => !allowed.some((re) => re.test(p))),
      "console errors, page errors or CSP violations",
    ).toEqual([]),
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
