import { describe, expect, it } from "vitest";
import { filterPartidaGroups, UNGROUPED_FILTER } from "@/lib/project/partida-filter";

const segments = [
  {
    id: "a",
    name: "Bloque A",
    partidas: [
      { id: "p1", name: "Vaciado losa" },
      { id: "p2", name: "Mamposteria norte" },
    ],
  },
  {
    id: "b",
    name: "Bloque B",
    partidas: [{ id: "p3", name: "Ebanisteria lobby" }],
  },
];
const ungrouped = [{ id: "p4", name: "Planos preliminares" }];

describe("filterPartidaGroups", () => {
  it("filters partidas by name case-insensitively", () => {
    const out = filterPartidaGroups(segments, ungrouped, { query: "LOSA" });
    expect(out.total).toBe(1);
    expect(out.segments[0].partidas[0].id).toBe("p1");
    expect(out.ungrouped).toHaveLength(0);
  });

  it("filters by bloque", () => {
    const out = filterPartidaGroups(segments, ungrouped, { segmentId: "b" });
    expect(out.total).toBe(1);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].id).toBe("b");
    expect(out.ungrouped).toHaveLength(0);
  });

  it("filters to ungrouped partidas only", () => {
    const out = filterPartidaGroups(segments, ungrouped, { segmentId: UNGROUPED_FILTER });
    expect(out.total).toBe(1);
    expect(out.segments).toHaveLength(0);
    expect(out.ungrouped[0].id).toBe("p4");
  });

  it("combines bloque and name filters", () => {
    const out = filterPartidaGroups(segments, ungrouped, { segmentId: "a", query: "mampo" });
    expect(out.total).toBe(1);
    expect(out.segments[0].partidas[0].id).toBe("p2");
  });

  it("reports empty results distinctly when filters are active", () => {
    const out = filterPartidaGroups(segments, ungrouped, { query: "missing" });
    expect(out.total).toBe(0);
    expect(out.hasFilters).toBe(true);
  });
});
