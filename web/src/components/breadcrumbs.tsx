import Link from "next/link";
import { ChevronRight } from "@/components/icons";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  /** Accessible label for the <nav>; e.g. t.breadcrumb.aria */
  ariaLabel: string;
};

/**
 * Presentational breadcrumb trail.
 * - Items with `href` render as links.
 * - The last item is always treated as the current page (aria-current="page"), link or not.
 * - Chevron separators are aria-hidden.
 * - Uses .kicker styling to match the muted, monospace header treatment.
 */
export function Breadcrumbs({ items, ariaLabel }: BreadcrumbsProps) {
  return (
    <nav aria-label={ariaLabel} style={{ marginBottom: 4 }}>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0 2px",
        }}
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={i}
              style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
            >
              {i > 0 && (
                <span aria-hidden="true" style={{ color: "var(--steel)", display: "inline-flex", alignItems: "center" }}>
                  <ChevronRight size={10} />
                </span>
              )}
              {isLast ? (
                <span
                  className="kicker"
                  aria-current="page"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="kicker"
                  style={{ textDecoration: "none", color: "var(--steel)" }}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="kicker">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
