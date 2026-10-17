import type { ErrorsLang } from "@/i18n/errors-copy";

/** Language of the error screens from <html lang> (set by the root layout); Spanish unless it says en. */
export function langFromHtml(value: string | null | undefined): ErrorsLang {
  return value?.toLowerCase().startsWith("en") ? "en" : "es";
}

/** Language from the r360_lang cookie (written by language-switcher, not httpOnly); Spanish by default. */
export function langFromCookie(cookie: string | null | undefined): ErrorsLang {
  const match = (cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith("r360_lang="));
  return match?.slice("r360_lang=".length) === "en" ? "en" : "es";
}
