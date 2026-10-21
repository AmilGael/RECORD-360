import { describe, expect, it } from "vitest";
import { foldQuery, matchesPlanosQuery } from "@/lib/planos/match";

describe("matchesPlanosQuery", () => {
  it("finds Planta Eléctrica.pdf from electrica", () => {
    expect(matchesPlanosQuery({
      name: "Planta Eléctrica.pdf",
      fileName: "Planta Eléctrica.pdf",
      uploader: "Ada",
      dateText: "19 oct 2026, 15:05 GMT-4",
    }, "electrica")).toBe(true);
    expect(foldQuery("Eléctrica")).toBe("electrica");
  });
  it("matches uploader and date text and is blank-tolerant", () => {
    const doc = { name: "A", fileName: null, uploader: "María", dateText: "19 oct 2026" };
    expect(matchesPlanosQuery(doc, "maria")).toBe(true);
    expect(matchesPlanosQuery(doc, "oct")).toBe(true);
    expect(matchesPlanosQuery(doc, "   ")).toBe(true);
    expect(matchesPlanosQuery(doc, "zzz")).toBe(false);
  });
});
