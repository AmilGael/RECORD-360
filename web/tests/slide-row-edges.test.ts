import { describe, expect, it } from "vitest";
import { fadeMask, hiddenEdges, wheelStep } from "@/lib/ui/slide-row-edges";

describe("which edges of a sliding row hide tabs", () => {
  it("hides nothing when everything fits, a subpixel of width included", () => {
    expect(hiddenEdges(0, 300, 300)).toEqual({ start: false, end: false });
    expect(hiddenEdges(0, 300, 300.6)).toEqual({ start: false, end: false });
  });

  it("ignores the few pixels of letter-spacing after the last tab, but not a hidden letter", () => {
    expect(hiddenEdges(0, 300, 303)).toEqual({ start: false, end: false });
    expect(hiddenEdges(0, 300, 306)).toEqual({ start: false, end: true });
    expect(hiddenEdges(3, 300, 303)).toEqual({ start: false, end: false });
  });

  it("hides the end at the start, both in the middle, the start at the end", () => {
    expect(hiddenEdges(0, 300, 500)).toEqual({ start: false, end: true });
    expect(hiddenEdges(100, 300, 500)).toEqual({ start: true, end: true });
    expect(hiddenEdges(200, 300, 500)).toEqual({ start: true, end: false });
  });
});

describe("the fade over a hidden edge", () => {
  it("is not drawn when nothing is hidden", () => {
    expect(fadeMask({ start: false, end: false })).toBeUndefined();
  });

  it("fades only the edge that hides something", () => {
    const end = fadeMask({ start: false, end: true })!;
    expect(end).toMatch(/^linear-gradient\(to right, #000 0/);
    expect(end).toContain("transparent 100%");
    const start = fadeMask({ start: true, end: false })!;
    expect(start).toMatch(/^linear-gradient\(to right, transparent 0/);
    expect(start).toContain("#000 100%");
  });
});

describe("the mouse wheel over a row that does not fit", () => {
  it("slides the row by the wheel's vertical turn while it can still move that way", () => {
    expect(wheelStep({ deltaX: 0, deltaY: 40 }, 0, 300, 500)).toBe(40);
    expect(wheelStep({ deltaX: 0, deltaY: -40 }, 100, 300, 500)).toBe(-40);
  });

  it("leaves the page to scroll when the row fits, is at that end, or the gesture is sideways", () => {
    expect(wheelStep({ deltaX: 0, deltaY: 40 }, 0, 300, 300)).toBe(0);
    expect(wheelStep({ deltaX: 0, deltaY: 40 }, 200, 300, 500)).toBe(0);
    expect(wheelStep({ deltaX: 0, deltaY: -40 }, 0, 300, 500)).toBe(0);
    expect(wheelStep({ deltaX: 30, deltaY: 10 }, 0, 300, 500)).toBe(0);
  });
});
