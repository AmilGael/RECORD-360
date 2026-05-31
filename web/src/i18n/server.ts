import { cookies } from "next/headers";
import { dictionaries, type Lang, type Dict } from "./dictionaries";

export const LANG_COOKIE = "r360_lang";

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === "en" ? "en" : "es";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: dictionaries[lang] };
}
