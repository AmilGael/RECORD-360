import { describe, expect, it } from "vitest";
import { filterPartidaGroups } from "@/lib/project/partida-filter";

type P = { name: string; progressPct?: number; createdAt?: Date; tagNames?: string[]; hasOpenCambios?: boolean };
const seg = (id: string, name: string, partidas: P[]) => ({ id, name, partidas });

const A = seg("a", "Bloque A", [
  { name: "Zapatas", progressPct: 80, createdAt: new Date("2026-01-10"), tagNames: ["Mamposteria"], hasOpenCambios: true },
  { name: "Muros", progressPct: 20, createdAt: new Date("2026-03-10"), tagNames: ["Diseno"], hasOpenCambios: false },
]);
const U: P[] = [{ name: "Limpieza", progressPct: 50, createdAt: new Date("2026-02-10"), tagNames: [], hasOpenCambios: false }];

describe("facet filters (R3.5)", () => {
  it("tags facet ORs within the facet", () => {
    const r = filterPartidaGroups([A], U, { tags: ["Mamposteria", "Ebanisteria"] });
    expect(r.total).toBe(1);
    expect(r.segments[0]!.partidas[0]!.name).toBe("Zapatas");
  });
  it("progress range is inclusive", () => {
    const r = filterPartidaGroups([A], U, { progressMin: 20, progressMax: 50 });
    expect(r.total).toBe(2); // Muros 20, Limpieza 50
  });
  it("openCambios facet keeps only partidas with open cambios", () => {
    const r = filterPartidaGroups([A], U, { openCambios: true });
    expect(r.total).toBe(1);
    expect(r.segments[0]!.partidas[0]!.name).toBe("Zapatas");
  });
  it("created date range filters by createdAt", () => {
    const r = filterPartidaGroups([A], U, { createdFrom: new Date("2026-02-01"), createdTo: new Date("2026-04-01") });
    expect(r.total).toBe(2); // Muros (mar), Limpieza (feb)
  });
  it("facets compose with query and report hasFilters", () => {
    const r = filterPartidaGroups([A], U, { query: "mu", progressMax: 30 });
    expect(r.total).toBe(1);
    expect(r.hasFilters).toBe(true);
  });
  it("absent facet fields on partidas never crash (backwards compatible)", () => {
    const r = filterPartidaGroups([seg("b", "B", [{ name: "Solo nombre" }])], [], { progressMin: 10 });
    expect(r.total).toBe(0); // unknown progress can't satisfy a progress facet
  });
});
