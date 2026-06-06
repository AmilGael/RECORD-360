"use client";

import { useState } from "react";
import { Moon, Sun } from "@/components/icons";

const THEME_COOKIE = "r360_theme";

export function ThemeSwitcher({
  initialTheme,
  labels,
}: {
  initialTheme: "light" | "dark";
  labels: { light: string; dark: string };
}) {
  const [theme, setTheme] = useState(initialTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.body.dataset.theme = next;
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      className="sidebar-icon-button"
      onClick={toggle}
      aria-label={dark ? labels.light : labels.dark}
      title={dark ? labels.light : labels.dark}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      <span>{dark ? labels.light : labels.dark}</span>
    </button>
  );
}
