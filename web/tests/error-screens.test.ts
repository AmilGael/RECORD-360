import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import RootError from "@/app/error";
import AppError from "@/app/app/error";
import GlobalError from "@/app/global-error";
import { errorsCopy } from "@/i18n/errors-copy";
import { dictionaries } from "@/i18n/dictionaries";
import { langFromCookie, langFromHtml } from "@/lib/i18n/error-lang";

const SECRET = "connect ECONNREFUSED 10.0.0.5:5432 at prisma.user.findFirst";
function boom(digest?: string) {
  return Object.assign(new Error(SECRET), digest ? { digest } : {});
}
const reset = () => {};
// React escapes apostrophes in text; compare against the escaped form.
const html = (s: string) => s.replace(/'/g, "&#x27;");

describe("error screen language helpers", () => {
  it("reads <html lang>, defaulting to Spanish", () => {
    expect(langFromHtml("en")).toBe("en");
    expect(langFromHtml("en-US")).toBe("en");
    expect(langFromHtml("es")).toBe("es");
    expect(langFromHtml("")).toBe("es");
    expect(langFromHtml(undefined)).toBe("es");
  });

  it("reads the r360_lang cookie, defaulting to Spanish", () => {
    expect(langFromCookie("r360_theme=light; r360_lang=en")).toBe("en");
    expect(langFromCookie("r360_lang=es")).toBe("es");
    expect(langFromCookie("x_r360_lang=en")).toBe("es");
    expect(langFromCookie("")).toBe("es");
  });
});

describe("error copy lives in dictionaries too", () => {
  it("exposes errors-copy as es.errors / en.errors", () => {
    expect(dictionaries.es.errors).toBe(errorsCopy.es);
    expect(dictionaries.en.errors).toBe(errorsCopy.en);
    expect(Object.keys(errorsCopy.en).sort()).toEqual(Object.keys(errorsCopy.es).sort());
  });
});

describe("error boundaries", () => {
  it.each([
    ["app/error.tsx", RootError, "/", errorsCopy.es.home],
    ["app/app/error.tsx", AppError, "/app", errorsCopy.es.backToApp],
  ])("%s shows retry, the digest as Código and a way back, never error.message", (_name, Screen, href, linkLabel) => {
    const out = renderToStaticMarkup(createElement(Screen, { error: boom("4242abcd"), reset }));
    expect(out).toContain(errorsCopy.es.retry);
    expect(out).toContain(`${errorsCopy.es.code}: 4242abcd`);
    expect(out).toContain(`href="${href}"`);
    expect(out).toContain(linkLabel);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("ECONNREFUSED");
  });

  it("omits the Código line when there is no digest", () => {
    const out = renderToStaticMarkup(createElement(AppError, { error: boom(), reset }));
    expect(out).not.toContain(`${errorsCopy.es.code}:`);
    expect(out).not.toContain(SECRET);
  });

  it("global-error renders its own document with inline styles, Spanish on the server, never error.message", () => {
    const out = renderToStaticMarkup(createElement(GlobalError, { error: boom("9f9f"), reset }));
    expect(out).toMatch(/^<html lang="es">/);
    expect(out).toContain("<body");
    expect(out).not.toContain("class=");
    expect(out).toContain(html(errorsCopy.es.title));
    expect(out).toContain(`${errorsCopy.es.code}: 9f9f`);
    expect(out).not.toContain(SECRET);
  });
});
