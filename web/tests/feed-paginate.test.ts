import { describe, expect, it } from "vitest";
import { pageWindow } from "@/lib/feed/paginate";

describe("pageWindow", () => {
  // Total 0: degenerate case — one page, nothing to show
  it("total 0 → page 1, totalPages 1, skip 0, no older, no newer", () => {
    const r = pageWindow(0, 1, 20);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(false);
  });

  // 45 items in pages of 20 → 3 pages total
  it("total 45, page 1 → totalPages 3, skip 0, hasOlder true, hasNewer false", () => {
    const r = pageWindow(45, 1, 20);
    expect(r.page).toBe(1);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(0);
    expect(r.hasOlder).toBe(true);
    expect(r.hasNewer).toBe(false);
  });

  it("total 45, page 2 → skip 20, hasOlder true, hasNewer true", () => {
    const r = pageWindow(45, 2, 20);
    expect(r.page).toBe(2);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(20);
    expect(r.hasOlder).toBe(true);
    expect(r.hasNewer).toBe(true);
  });

  it("total 45, page 3 → skip 40, hasOlder false, hasNewer true", () => {
    const r = pageWindow(45, 3, 20);
    expect(r.page).toBe(3);
    expect(r.totalPages).toBe(3);
    expect(r.skip).toBe(40);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(true);
  });

  // Clamping: page 0 → treated as page 1
  it("page 0 clamps to 1", () => {
    const r = pageWindow(45, 0, 20);
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
    expect(r.hasNewer).toBe(false);
  });

  // Clamping: page 99 (>totalPages) → clamps to totalPages
  it("page 99 clamps to totalPages", () => {
    const r = pageWindow(45, 99, 20);
    expect(r.page).toBe(3);
    expect(r.skip).toBe(40);
    expect(r.hasOlder).toBe(false);
  });

  // Exact boundary: 20 items exactly = 1 full page, no older
  it("total 20, page 1 → totalPages 1, no older", () => {
    const r = pageWindow(20, 1, 20);
    expect(r.totalPages).toBe(1);
    expect(r.hasOlder).toBe(false);
    expect(r.hasNewer).toBe(false);
  });
});
