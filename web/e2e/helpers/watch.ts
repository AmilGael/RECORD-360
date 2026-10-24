import type { Page } from "@playwright/test";
import { expect } from "./guards";

/** HTTP 500 and above. The console guard does not see these. */
export function collectServerErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  return problems;
}

export function assertServerClean(problems: string[]) {
  expect(problems, "responses with status 500 or above").toEqual([]);
}

/** The quest's overflow check: the scrolling element wider than the viewport. */
export async function assertNoHorizontalOverflow(page: Page, where: string) {
  const wider = await page.evaluate(() => {
    const el = document.scrollingElement;
    if (!el) return false;
    return el.scrollWidth > window.innerWidth;
  });
  expect(wider, `horizontal overflow on ${where}`).toBe(false);
}
