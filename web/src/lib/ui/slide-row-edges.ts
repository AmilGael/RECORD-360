/**
 * The arithmetic behind a row of tabs that slides sideways when it does not
 * fit (see `SlideRow`): which edges hide tabs, the fade that says so, and how
 * far a mouse wheel moves it. Pure, so it is tested without a browser.
 */

export type HiddenEdges = { readonly start: boolean; readonly end: boolean };

/**
 * How far a row may run over before it counts as not fitting. Widths come back
 * fractional, and the last tab carries its letter-spacing after its last
 * letter, a few pixels nobody can see; without this slack an English office
 * bar at 1200px faded its last tab over 2px of empty space.
 */
const SLACK = 4;

export function hiddenEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): HiddenEdges {
  return {
    start: scrollLeft > SLACK,
    end: scrollLeft + clientWidth < scrollWidth - SLACK,
  };
}

/**
 * A mask that fades the edge where more tabs wait, and only that edge, so a
 * row that fits is drawn exactly as before and a row that does not says so
 * without a scrollbar. The end fades wider than the start: it is the edge a
 * reader moving right looks at next.
 */
export function fadeMask(edges: HiddenEdges): string | undefined {
  if (!edges.start && !edges.end) return undefined;
  const from = edges.start ? "transparent 0, #000 24px" : "#000 0";
  const to = edges.end ? "#000 calc(100% - 40px), transparent 100%" : "#000 100%";
  return `linear-gradient(to right, ${from}, ${to})`;
}

/**
 * How far a mouse wheel slides the row, in pixels: the wheel's vertical turn,
 * but only while the row can still move that way. Zero hands the gesture back
 * to the page, so a wheel over a row that fits, or one already at its end,
 * scrolls the page as it always did, and a trackpad's own sideways swipe is
 * left to the browser.
 */
export function wheelStep(
  wheel: { readonly deltaX: number; readonly deltaY: number },
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): number {
  if (Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return 0;
  const edges = hiddenEdges(scrollLeft, clientWidth, scrollWidth);
  if (wheel.deltaY > 0 && !edges.end) return 0;
  if (wheel.deltaY < 0 && !edges.start) return 0;
  return wheel.deltaY;
}
