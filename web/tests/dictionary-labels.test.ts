import { describe, it, expect } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";

describe("portfolio health phase labels (architect round 2)", () => {
  it("names the color bands as construction phases in Spanish", () => {
    expect(dictionaries.es.dash.analyticsRed).toBe("Fase de Definición");
    expect(dictionaries.es.dash.analyticsYellow).toBe("Fase de Avance");
    expect(dictionaries.es.dash.analyticsGreen).toBe("Fase de Terminación");
  });
  it("names the color bands as phases in English", () => {
    expect(dictionaries.en.dash.analyticsRed).toBe("Definition phase");
    expect(dictionaries.en.dash.analyticsYellow).toBe("Progress phase");
    expect(dictionaries.en.dash.analyticsGreen).toBe("Completion phase");
  });
});

describe("role descriptions include scope and synonyms", () => {
  it("every role description is substantive (scope + synonyms) in both locales", () => {
    for (const lang of ["es", "en"] as const) {
      for (const role of ["ADMIN", "MANAGER", "SUPERVISOR", "RESIDENT"] as const) {
        const desc = dictionaries[lang].admin.roleDescs[role];
        expect(desc.length).toBeGreaterThan(80);
        expect(desc).toMatch(/\(/); // has the synonyms parenthetical
      }
    }
  });
});

describe("per-space upload labels", () => {
  it("has an upload label for every DocumentKind in both locales", () => {
    const kinds = ["PLANO", "DOCUMENTO", "LEVANTAMIENTO", "IDEA", "MINUTA", "PLANO_ACTUALIZADO"] as const;
    for (const lang of ["es", "en"] as const) {
      for (const k of kinds) {
        expect(dictionaries[lang].planos.uploadByKind[k]).toBeTruthy();
      }
    }
    expect(dictionaries.es.planos.uploadByKind.LEVANTAMIENTO).toBe("Subir levantamiento");
  });
});
