"use client";
import { useCallback, useRef } from "react";
import { Search } from "@/components/icons";

/**
 * Client-side live-filter for project cards on the dashboard.
 * Filters by matching the search query against each repo-card's data-name attribute.
 */
export function DashboardSearch({ placeholder }: { placeholder: string }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase().trim();

    // Debounce for performance
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const list = document.getElementById("dash-active-list");
      if (!list) return;
      const cards = list.querySelectorAll<HTMLElement>(".repo-card");
      cards.forEach((card) => {
        const name = card.getAttribute("data-name") ?? "";
        card.style.display = name.includes(query) || query === "" ? "" : "none";
      });
    }, 120);
  }, []);

  return (
    <div className="search-wrap">
      <span className="icon" aria-hidden="true"><Search size={15} /></span>
      <input
        type="search"
        className="search-input"
        placeholder={placeholder}
        onChange={handleInput}
        autoComplete="off"
      />
    </div>
  );
}
