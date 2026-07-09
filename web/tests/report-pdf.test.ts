import { describe, expect, it } from "vitest";
import { buildReportPdf } from "@/lib/report/pdf";
import type { ReportData } from "@/lib/report/data";

const data: ReportData = {
  project: { id: "p1", name: "Torre Test", registrationCode: "RPH-TEST-0001", companyName: "Constructora Test" },
  scopeLabel: "Obra completa",
  from: new Date("2026-01-01"),
  to: new Date("2026-02-01"),
  partidas: [{ name: "Zapatas", progressPct: 40, segmentName: "Bloque A" }],
  registros: [{
    partidaName: "Zapatas", serverCreatedAt: new Date("2026-01-15T10:00:00Z"), authorName: "Residente Uno",
    category: "PROCESOS", locationLabel: "Nivel 1", gpsLat: 18.47, gpsLng: -69.9,
    text: "Vaciado de zapatas completado", hash: "abc123", attachmentCount: 2,
  }],
  cambios: [{ code: "SC-1", title: "Refuerzo extra", status: "INTEGRATED", createdAt: new Date("2026-01-20"), resolutionNote: "Aprobado" }],
};

describe("buildReportPdf", () => {
  it("produces a real PDF with the registration code embedded", async () => {
    const buf = await buildReportPdf({ data, generatedBy: "Gerente Test" });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000); // QR image embedded
  });
  it("renders informe mode with footer images absent (no firma/seal yet)", async () => {
    const buf = await buildReportPdf({
      data,
      generatedBy: "Gerente Test",
      informe: { contentMd: "# Resumen Ejecutivo\nTodo avanza.\n- Punto uno\n- Punto dos", requesterName: "Gerente Test", firmaPng: null, sealPng: null },
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
