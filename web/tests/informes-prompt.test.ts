import { describe, expect, it } from "vitest";
import { buildInformeUserMessage } from "@/lib/informes/prompt";
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
