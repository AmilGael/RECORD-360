"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fadeMask, hiddenEdges, wheelStep, type HiddenEdges } from "@/lib/ui/slide-row-edges";

/**
 * A row of tabs that slides sideways when it does not fit, instead of pushing
 * into whatever sits beside it or forcing the page to scroll sideways.
 *
 * No scrollbar: the edge that hides tabs fades instead (`fadeMask`), and a
 * mouse wheel slides the row as well as a finger or trackpad does. When
 * everything fits it is drawn exactly as a plain row. The active tab (the
 * element marked `aria-current="page"`) is brought into view on load and
 * whenever `activeKey` changes.
 *
 * Styles are inline so the component does not depend on any stylesheet.
 */
const ROW_STYLE: CSSProperties = {
  minWidth: 0,
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
};

export function SlideRow({
  children,
  className,
  activeKey,
}: {
  children: ReactNode;
  className?: string;
  /** Changes when the active tab does (the pathname), to bring it into view. */
  activeKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<HiddenEdges>({ start: false, end: false });

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => {
      const next = hiddenEdges(row.scrollLeft, row.clientWidth, row.scrollWidth);
      setEdges((previous) =>
        previous.start === next.start && previous.end === next.end ? previous : next,
      );
    };
    const onWheel = (event: WheelEvent) => {
      const step = wheelStep(event, row.scrollLeft, row.clientWidth, row.scrollWidth);
      if (step === 0) return;
      event.preventDefault();
      row.scrollLeft += step;
    };

    update();
    row.addEventListener("scroll", update, { passive: true });
    row.addEventListener("wheel", onWheel, { passive: false });
    // The row's own box, and its tabs', since a language switch changes the
    // labels' width without changing the row's.
    const observer = new ResizeObserver(update);
    observer.observe(row);
    for (const child of Array.from(row.children)) observer.observe(child);
    return () => {
      row.removeEventListener("scroll", update);
      row.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeKey]);

  const mask = fadeMask(edges);
  const style: CSSProperties = mask
    ? { ...ROW_STYLE, maskImage: mask, WebkitMaskImage: mask }
    : ROW_STYLE;
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
