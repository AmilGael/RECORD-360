import { describe, expect, it } from "vitest";
import { projectHrefWithParams, spaceHref } from "@/lib/project/space-links";

// WS4F: the block-navigation bug was bloque-spaces-panel's own links using a
// `spaceBlock` param while the rest of the project page reads `block` —
// clicking a space link silently dropped `block` and kicked the user out of
// the block workspace. These tests pin the fix at the unit-testable layer:
// every generated href must carry the canonical `block=` param, and must
// preserve the rest of the workspace state (selected partida, filters).

describe("spaceHref", () => {
  it("always carries the canonical block= param", () => {
    const href = spaceHref("proj1", {}, "seg-42", "ideas");
    expect(href).toContain("block=seg-42");
    expect(href).not.toContain("spaceBlock=");
  });

  it("carries the requested space", () => {
    const href = spaceHref("proj1", {}, "seg-42", "media");
    expect(href).toContain("space=media");
  });

  it("preserves the selected partida across a space switch", () => {
    const href = spaceHref("proj1", { p: "partida-9" }, "seg-42", "media");
    expect(href).toContain("p=partida-9");
    expect(href).toContain("block=seg-42");
  });

  it("preserves the selected partida across a block switch", () => {
    const href = spaceHref("proj1", { p: "partida-9" }, "other-seg", "cuaderno");
    expect(href).toContain("p=partida-9");
    expect(href).toContain("block=other-seg");
  });

  it("preserves search/facet filters (q, tags, pmin/pmax, cambios, ffrom/fto)", () => {
    const href = spaceHref("proj1", {
      q: "zapata", tags: ["urgente", "revisar"], pmin: "10", pmax: "90", cambios: "open", ffrom: "2027-01-01", fto: "2027-02-01",
    }, "seg-1", "recordatorios");
    expect(href).toContain("q=zapata");
    expect(href).toContain("tags=urgente");
    expect(href).toContain("tags=revisar");
    expect(href).toContain("pmin=10");
    expect(href).toContain("pmax=90");
    expect(href).toContain("cambios=open");
    expect(href).toContain("ffrom=2027-01-01");
    expect(href).toContain("fto=2027-02-01");
    expect(href).toContain("block=seg-1");
  });

  it("always sets tab=code", () => {
    expect(spaceHref("proj1", {}, "seg-1", "cuaderno")).toContain("tab=code");
  });
});

describe("projectHrefWithParams", () => {
  it("omits empty/null/undefined values", () => {
    const href = projectHrefWithParams("proj1", { q: "", p: null, block: undefined, tab: "code" });
    expect(href).toBe("/app/projects/proj1?tab=code");
  });

  it("builds a bare project link with no params", () => {
    expect(projectHrefWithParams("proj1", {})).toBe("/app/projects/proj1");
  });
});
