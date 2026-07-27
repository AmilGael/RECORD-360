import { describe, expect, it } from "vitest";
import { buildInformeUserMessage, buildInformeSystem } from "@/lib/informes/prompt";
import type { ReportData } from "@/lib/report/data";

function makeRegistro(i: number): ReportData["registros"][number] {
  return {
    serverCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    authorName: "Autor",
    partidaName: "Partida",
    category: null,
    locationLabel: null,
    gpsLat: null,
    gpsLng: null,
    text: `reg-${i}`,
    hash: `hash-${i}`,
    attachmentCount: 0,
  };
}

function makeData(registroCount: number): ReportData {
  return {
    project: { id: "proj-1", name: "Obra Test", registrationCode: "RPH-0001", companyName: "Constructora XYZ" },
    scopeLabel: "Obra completa",
    from: null,
    to: null,
    partidas: [{ name: "Zapatas", progressPct: 50, segmentName: null }],
    registros: Array.from({ length: registroCount }, (_, i) => makeRegistro(i + 1)),
    cambios: [],
  };
}

describe("buildInformeUserMessage — prompt cap", () => {
  it("includes the TRUE total count (401) in the header even when capped", () => {
    const msg = buildInformeUserMessage(makeData(401), "Test brief");
    expect(msg).toContain("REGISTROS DEL PERIODO (401)");
  });

  it("appends the omission line with the correct omitted count (1) when over 400", () => {
    const msg = buildInformeUserMessage(makeData(401), "Test brief");
    expect(msg).toContain("1 registros anteriores omitidos por espacio");
  });

  it("does NOT include an omission line when at or below the cap (400)", () => {
    const msg = buildInformeUserMessage(makeData(400), "Test brief");
    expect(msg).not.toContain("omitidos por espacio");
  });

  it("keeps all five deterministic header lines for a small input", () => {
    const msg = buildInformeUserMessage(makeData(2), "Mi solicitud");
    expect(msg).toContain("OBRA: Obra Test (RPH-0001)");
    expect(msg).toContain("ALCANCE: Obra completa");
    expect(msg).toContain("PARTIDAS Y AVANCE:");
    expect(msg).toContain("REGISTROS DEL PERIODO (2)");
    expect(msg).toContain("SOLICITUDES DE CAMBIO (0)");
  });
});

describe("buildInformeSystem — archetype branching (R3 WS7)", () => {
  it("produces materially distinct prompts for the three archetypes", () => {
    const owner = buildInformeSystem("OWNER");
    const senior = buildInformeSystem("SENIOR_MANAGEMENT");
    const personal = buildInformeSystem("PERSONAL_FEEDBACK");
    expect(owner).not.toBe(senior);
    expect(owner).not.toBe(personal);
    expect(senior).not.toBe(personal);
  });

  it("OWNER emphasizes executive status, milestones, risks and decisions", () => {
    const s = buildInformeSystem("OWNER");
    expect(s).toContain("Hitos y Avance");
    expect(s).toContain("Decisiones Requeridas");
    expect(s).toContain("Cronograma y Costos");
    expect(s).toMatch(/propietario/i);
  });

  it("SENIOR_MANAGEMENT emphasizes delivery risk, trends, escalation and dependencies", () => {
    const s = buildInformeSystem("SENIOR_MANAGEMENT");
    expect(s).toContain("Riesgo de Entrega");
    expect(s).toContain("Tendencias de Desempeno");
    expect(s).toContain("Responsables y Escalamiento");
    expect(s).toContain("Dependencias entre Bloques");
  });

  it("PERSONAL_FEEDBACK emphasizes individual contributions, record quality and forbids unsupported personnel judgments", () => {
    const s = buildInformeSystem("PERSONAL_FEEDBACK");
    expect(s).toContain("Contribuciones Individuales");
    expect(s).toContain("Calidad y Consistencia de Registros");
    expect(s).toMatch(/PROHIBIDO/);
    expect(s).toMatch(/juicios de personal no respaldados/i);
  });

  it("all archetypes still keep the shared base rules (no invention, markdown, Spanish, length cap)", () => {
    for (const a of ["OWNER", "SENIOR_MANAGEMENT", "PERSONAL_FEEDBACK"] as const) {
      const s = buildInformeSystem(a);
      expect(s).toMatch(/nunca inventes/i);
      expect(s).toMatch(/900 palabras/);
    }
  });
});
