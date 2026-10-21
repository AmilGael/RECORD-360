import { describe, expect, it } from "vitest";
import { applyPartidaNameFilter, filterPartidaGroups, partidaNameMatches, shouldAdoptUrlQuery, UNGROUPED_FILTER } from "@/lib/project/partida-filter";
import { projectProgress } from "@/lib/project/progress";
import { parseDayBound } from "@/lib/time/zone";

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

  it("date-only created filters cover whole Santo Domingo days", () => {
    const dated = [
      { id: "d1", name: "Día 00:10", createdAt: new Date("2026-03-10T04:10:00.000Z") },
      { id: "d2", name: "Día 23:30", createdAt: new Date("2026-03-11T03:30:00.000Z") },
      { id: "d3", name: "Siguiente 00:10", createdAt: new Date("2026-03-11T04:10:00.000Z") },
      { id: "d4", name: "Anterior 23:30", createdAt: new Date("2026-03-10T03:30:00.000Z") },
    ];
    const out = filterPartidaGroups([], dated, {
      createdFrom: parseDayBound("2026-03-10", "start"),
      createdTo: parseDayBound("2026-03-10", "end"),
    });
    expect(out.ungrouped.map((p) => p.id)).toEqual(["d1", "d2"]);
  });

  it("reports empty results distinctly when filters are active", () => {
    const out = filterPartidaGroups(segments, ungrouped, { query: "missing" });
    expect(out.total).toBe(0);
    expect(out.hasFilters).toBe(true);
  });
});

const rich = [
  {
    id: "a",
    name: "Bloque A",
    partidas: [
      { id: "p1", name: "Vaciado losa", progressPct: 10 },
      { id: "p2", name: "Mampostería norte", progressPct: 40 },
    ],
  },
  {
    id: "b",
    name: "Bloque B",
    partidas: [
      { id: "p3", name: "Ebanisteria lobby", progressPct: 80 },
      { id: "p6", name: "Losa techo", progressPct: 20 },
    ],
  },
];
const richUngrouped = [{ id: "p4", name: "Planos preliminares", progressPct: 0 }];

type Row = { id: string; name: string; progressPct: number };
type Out = { segments: { id: string; partidas: Row[] }[]; ungrouped: Row[]; total: number; hasFilters: boolean };

function shape(out: Out) {
  return {
    total: out.total,
    hasFilters: out.hasFilters,
    empty: out.hasFilters && out.total === 0,
    segments: out.segments.map((s) => ({
      id: s.id,
      ids: s.partidas.map((p) => p.id),
      percent: projectProgress(s.partidas),
    })),
    ungrouped: out.ungrouped.map((p) => p.id),
  };
}

/** What the server returned when the name query was applied with the facets. */
function serverResult(filters: Parameters<typeof filterPartidaGroups>[2]) {
  return filterPartidaGroups(rich, richUngrouped, filters);
}

/** Facets on the server, then the name query the client applies. */
function clientResult(filters: Parameters<typeof filterPartidaGroups>[2]) {
  const { query, ...facets } = filters;
  const facetRows = filterPartidaGroups(rich, richUngrouped, facets);
  return applyPartidaNameFilter(facetRows.segments, facetRows.ungrouped, query, facetRows.hasFilters);
}

describe("partida name filter parity", () => {
  it("keeps accents in the comparison", () => {
    expect(partidaNameMatches("Mampostería norte", "mamposteria")).toBe(false);
    expect(partidaNameMatches("Mampostería norte", "NORTE")).toBe(true);
    expect(partidaNameMatches("Vaciado losa", "  LOSA ")).toBe(true);
  });

  it("matches the server result, including percents, totals, and the empty state", () => {
    const cases: { filters: Parameters<typeof filterPartidaGroups>[2]; expected: ReturnType<typeof shape> }[] = [
      {
        filters: { query: "  LOSA " },
        expected: {
          total: 2,
          hasFilters: true,
          empty: false,
          segments: [
            { id: "a", ids: ["p1"], percent: 10 },
            { id: "b", ids: ["p6"], percent: 20 },
          ],
          ungrouped: [],
        },
      },
      {
        filters: { query: "mamposteria" },
        expected: { total: 0, hasFilters: true, empty: true, segments: [], ungrouped: [] },
      },
      {
        filters: { query: "Mampostería" },
        expected: {
          total: 1,
          hasFilters: true,
          empty: false,
          segments: [{ id: "a", ids: ["p2"], percent: 40 }],
          ungrouped: [],
        },
      },
      {
        filters: {},
        expected: {
          total: 5,
          hasFilters: false,
          empty: false,
          segments: [
            { id: "a", ids: ["p1", "p2"], percent: 25 },
            { id: "b", ids: ["p3", "p6"], percent: 50 },
          ],
          ungrouped: ["p4"],
        },
      },
      {
        filters: { segmentId: "b", query: "losa" },
        expected: {
          total: 1,
          hasFilters: true,
          empty: false,
          segments: [{ id: "b", ids: ["p6"], percent: 20 }],
          ungrouped: [],
        },
      },
      {
        filters: { progressMin: 50, query: "lobby" },
        expected: {
          total: 1,
          hasFilters: true,
          empty: false,
          segments: [{ id: "b", ids: ["p3"], percent: 80 }],
          ungrouped: [],
        },
      },
    ];

    for (const { filters, expected } of cases) {
      const server = shape(serverResult(filters));
      const client = shape(clientResult(filters));
      expect(server).toEqual(expected);
      expect(client).toEqual(server);
    }
  });
});

describe("shouldAdoptUrlQuery", () => {
  it("keeps the typing when a refresh echoes the box's own last write", () => {
    // Wrote "los", user typed on to "losa", a refresh renders q=los.
    expect(shouldAdoptUrlQuery("los", "los", "los")).toBe(false);
  });
  it("keeps the typing when a refresh rendered before the latest write", () => {
    // The request left with q=los; the box has since written "losa".
    expect(shouldAdoptUrlQuery("los", "losa", "losa")).toBe(false);
  });
  it("adopts a real navigation: Limpiar drops q", () => {
    expect(shouldAdoptUrlQuery("", "losa", "")).toBe(true);
  });
  it("adopts a real navigation to a different query (a facet link or submit)", () => {
    expect(shouldAdoptUrlQuery("muro", "losa", "muro")).toBe(true);
  });
  it("compares the URL value trimmed, as the server does", () => {
    expect(shouldAdoptUrlQuery("muro", "losa", "muro ")).toBe(true);
  });
  it("does nothing on the first render", () => {
    expect(shouldAdoptUrlQuery("losa", "losa", "losa")).toBe(false);
  });
});
