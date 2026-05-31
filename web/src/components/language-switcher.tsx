"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/i18n/dictionaries";

export function LanguageSwitcher({ current }: { current: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(lang: Lang) {
    if (lang === current) return;
    document.cookie = `r360_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="lang-switch" data-pending={pending} aria-label="Language">
      <button type="button" data-active={current === "es"} onClick={() => set("es")}>ES</button>
      <span className="lang-sep">·</span>
      <button type="button" data-active={current === "en"} onClick={() => set("en")}>EN</button>
    </div>
  );
}
