"use client";
import type { ReactNode } from "react";
import Link from "next/link";

// prefetch={false}: hovering must never mark read (marking is onClick only).
// Primary unmodified click marks; middle-click and modified clicks stay
// ordinary link opens and do not mark.

export function NotificationTitleLink({
  href,
  className,
  children,
  onPrimaryOpen,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onPrimaryOpen: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        onPrimaryOpen();
      }}
    >
      {children}
    </Link>
  );
}
