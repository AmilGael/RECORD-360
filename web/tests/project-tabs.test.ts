import { describe, expect, it } from "vitest";
import {
  PROJECT_TABS,
  activeProjectTab,
  legacyTabTarget,
  projectTabHref,
} from "@/lib/project/tabs";

describe("PROJECT_TABS", () => {
  it("lists the five tabs in order with their route segments", () => {
    expect(PROJECT_TABS.map((t) => t.id)).toEqual([
      "partidas",
      "planos",
      "solicitudes",
      "analitica",
      "informes",
    ]);
    expect(PROJECT_TABS.map((t) => t.segment)).toEqual([
      "",
      "planos",
      "solicitudes",
      "analitica",
      "informes",
    ]);
    expect(PROJECT_TABS.map((t) => t.labelKey)).toEqual([
      "tabPartidas",
      "tabPlanos",
      "tabSolicitudes",
      "tabAnalytics",
      "tabInformes",
    ]);
  });
});

describe("projectTabHref", () => {
  it("builds the index tab href with params", () => {
    expect(projectTabHref("P1", "partidas", { block: "B" })).toBe("/app/projects/P1?block=B");
  });

  it("builds a sub-route href without params", () => {
    expect(projectTabHref("P1", "solicitudes")).toBe("/app/projects/P1/solicitudes");
    expect(projectTabHref("P1", "partidas")).toBe("/app/projects/P1");
  });

  it("drops empty, null and undefined params", () => {
    expect(
      projectTabHref("P1", "planos", { pq: "", a: null, b: undefined, c: "x" }),
    ).toBe("/app/projects/P1/planos?c=x");
  });

  it("repeats the key for arrays and drops empty items", () => {
    expect(projectTabHref("P1", "partidas", { tags: ["a", "b", ""] })).toBe(
      "/app/projects/P1?tags=a&tags=b",
    );
  });

  it("omits the query string when every param is dropped", () => {
    expect(projectTabHref("P1", "informes", { x: "", y: [] })).toBe("/app/projects/P1/informes");
  });
});

describe("legacyTabTarget", () => {
  it("maps cambios to solicitudes", () => {
    expect(legacyTabTarget("P1", { tab: "cambios" })).toBe("/app/projects/P1/solicitudes");
  });

  it("maps code to the index and drops the tab key", () => {
    expect(legacyTabTarget("P1", { tab: "code", block: "B", p: "X" })).toBe(
      "/app/projects/P1?block=B&p=X",
    );
  });

  it("keeps other params on a sub-route", () => {
    expect(legacyTabTarget("P1", { tab: "planos", pq: "muro" })).toBe(
      "/app/projects/P1/planos?pq=muro",
    );
  });

  it("maps analitica and informes", () => {
    expect(legacyTabTarget("P1", { tab: "analitica" })).toBe("/app/projects/P1/analitica");
    expect(legacyTabTarget("P1", { tab: "informes" })).toBe("/app/projects/P1/informes");
  });

  it("sends an unknown tab to the index", () => {
    expect(legacyTabTarget("P1", { tab: "zzz" })).toBe("/app/projects/P1");
  });

  it("treats a tab value with different casing as unknown", () => {
    expect(legacyTabTarget("P1", { tab: "Cambios" })).toBe("/app/projects/P1");
    expect(legacyTabTarget("P1", { tab: "INFORMES" })).toBe("/app/projects/P1");
  });

  it("uses the first value when tab is given twice", () => {
    expect(legacyTabTarget("P1", { tab: ["informes", "planos"] })).toBe(
      "/app/projects/P1/informes",
    );
  });

  it("keeps extra params in order with repeated tags on cambios", () => {
    expect(
      legacyTabTarget("P1", {
        tab: "cambios",
        block: "B",
        p: "X",
        q: "muro",
        tags: ["a", "b"],
      }),
    ).toBe("/app/projects/P1/solicitudes?block=B&p=X&q=muro&tags=a&tags=b");
  });

  it("returns null when there is no tab key, so there is no redirect loop", () => {
    expect(legacyTabTarget("P1", {})).toBeNull();
    expect(legacyTabTarget("P1", { block: "B" })).toBeNull();
    expect(legacyTabTarget("P1", { tab: undefined, block: "B" })).toBeNull();
    expect(legacyTabTarget("P1", { tab: [] })).toBeNull();
  });

  it("never produces a target that would redirect again", () => {
    for (const tab of ["code", "planos", "cambios", "analitica", "informes", "zzz", ""]) {
      const target = legacyTabTarget("P1", { tab, block: "B" });
      expect(target).not.toBeNull();
      expect(target).not.toContain("tab=");
    }
  });
});

describe("activeProjectTab", () => {
  it("is partidas on the index", () => {
    expect(activeProjectTab("/app/projects/P1", "P1")).toBe("partidas");
  });

  it("is partidas on the index with a trailing slash", () => {
    expect(activeProjectTab("/app/projects/P1/", "P1")).toBe("partidas");
  });

  it("matches sub-routes", () => {
    expect(activeProjectTab("/app/projects/P1/planos", "P1")).toBe("planos");
    expect(activeProjectTab("/app/projects/P1/planos/", "P1")).toBe("planos");
    expect(activeProjectTab("/app/projects/P1/solicitudes", "P1")).toBe("solicitudes");
    expect(activeProjectTab("/app/projects/P1/analitica", "P1")).toBe("analitica");
    expect(activeProjectTab("/app/projects/P1/informes", "P1")).toBe("informes");
  });

  it("matches deeper subpaths of a tab", () => {
    expect(activeProjectTab("/app/projects/P1/informes/I9", "P1")).toBe("informes");
  });

  it("counts cambios/<id> as solicitudes", () => {
    expect(activeProjectTab("/app/projects/P1/cambios/CR9", "P1")).toBe("solicitudes");
  });

  it("falls back to partidas for an unknown subpath", () => {
    expect(activeProjectTab("/app/projects/P1/zzz", "P1")).toBe("partidas");
  });

  it("does not match a tab segment that merely shares a prefix", () => {
    expect(activeProjectTab("/app/projects/P1/planosx", "P1")).toBe("partidas");
  });

  it("does not confuse a longer project id with the given one", () => {
    expect(activeProjectTab("/app/projects/P10/planos", "P1")).toBe("partidas");
  });
});
