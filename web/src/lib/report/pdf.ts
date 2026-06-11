// Shared pdfkit report builder (R2). pdfkit is in serverExternalPackages, so
// require() at runtime like the existing partida report route does.
import QRCode from "qrcode";
import type { ReportData } from "./data";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as typeof import("pdfkit");

const FONT_BOLD = "Helvetica-Bold";
const FONT_NORMAL = "Helvetica";
const FONT_SMALL = "Helvetica-Oblique";
const PRIMARY = "#111111";
const MUTED = "#555555";
const RULE = "#cccccc";

export function sanitizePdfText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

function collect(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function rule(doc: InstanceType<typeof PDFDocument>, color = RULE, width = 0.5) {
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(color).lineWidth(width).stroke();
}

export type InformeRender = {
  contentMd: string;
  requesterName: string;
  firmaPng: Buffer | null;
  sealPng: Buffer | null;
};

export async function buildReportPdf(opts: {
  data: ReportData;
  generatedBy: string;
  informe?: InformeRender;
}): Promise<Buffer> {
  const { data, generatedBy, informe } = opts;
  const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
  const done = collect(doc);

  // ── Header: company, obra, scope, range, code + QR ─────────────────────────
  const qr = await QRCode.toBuffer(
    `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/verify/${data.project.registrationCode}`,
    { margin: 1, width: 110 },
  );
  doc.image(qr, doc.page.width - 50 - 80, 50, { width: 80 });

  doc.font(FONT_BOLD).fontSize(18).fillColor(PRIMARY).text(sanitizePdfText(data.project.companyName), 50, 50, { width: doc.page.width - 200 });
  doc.font(FONT_NORMAL).fontSize(11).fillColor(MUTED);
  doc.text(`Obra: ${sanitizePdfText(data.project.name)}`);
  doc.text(sanitizePdfText(data.scopeLabel));
  doc.font(FONT_NORMAL).fontSize(10);
  doc.text(`Codigo de Registro: ${data.project.registrationCode}`);
  if (data.from || data.to) {
    doc.text(`Periodo: ${data.from ? fmt(data.from).slice(0, 10) : "inicio"} - ${data.to ? fmt(data.to).slice(0, 10) : "hoy"}`);
  }
  doc.text(`Generado: ${fmt(new Date())}  ·  por ${sanitizePdfText(generatedBy)}`);
  doc.moveDown(0.6);
  rule(doc, "#333333", 1.5);
  doc.moveDown(0.8);

  if (informe) {
    // ── Informe body: minimal markdown (#, ##, -, plain) ──────────────────────
    for (const raw of informe.contentMd.split("\n")) {
      const line = sanitizePdfText(raw.trimEnd());
      if (!line.trim()) { doc.moveDown(0.4); continue; }
      if (line.startsWith("## ")) {
        doc.moveDown(0.3); doc.font(FONT_BOLD).fontSize(12).fillColor(PRIMARY).text(line.slice(3));
      } else if (line.startsWith("# ")) {
        doc.moveDown(0.4); doc.font(FONT_BOLD).fontSize(14).fillColor(PRIMARY).text(line.slice(2));
      } else if (line.startsWith("- ")) {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY).text(`  •  ${line.slice(2)}`, { lineGap: 1 });
      } else {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY).text(line, { lineGap: 1 });
      }
    }
    // ── Footer block: requester + firma + seal ────────────────────────────────
    doc.moveDown(1.2);
    rule(doc);
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY).text(`Solicitado por: ${sanitizePdfText(informe.requesterName)}`);
    if (informe.firmaPng) {
      doc.moveDown(0.3);
      doc.image(informe.firmaPng, { fit: [160, 60] });
    }
    if (informe.sealPng) {
      doc.moveDown(0.4);
      doc.image(informe.sealPng, { fit: [90, 90] });
    }
  } else {
    // ── Deterministic body: partidas summary, registros, cambios ─────────────
    doc.font(FONT_BOLD).fontSize(12).fillColor(PRIMARY).text("Partidas");
    doc.moveDown(0.2);
    for (const p of data.partidas) {
      doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY)
        .text(`${sanitizePdfText(p.name)}${p.segmentName ? `  (${sanitizePdfText(p.segmentName)})` : ""}  ·  ${p.progressPct}%`);
    }
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(12).fillColor(PRIMARY).text(`Registros (${data.registros.length})`);
    doc.moveDown(0.3);
    for (const r of data.registros) {
      doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY).text(`${fmt(r.serverCreatedAt)}  ·  ${sanitizePdfText(r.authorName)}  ·  ${sanitizePdfText(r.partidaName)}`);
      const meta: string[] = [];
      if (r.category) meta.push(sanitizePdfText(r.category));
      if (r.locationLabel) meta.push(`Ubic: ${sanitizePdfText(r.locationLabel)}`);
      if (r.gpsLat !== null && r.gpsLng !== null) meta.push(`GPS: ${r.gpsLat.toFixed(6)}, ${r.gpsLng.toFixed(6)}`);
      if (meta.length) doc.font(FONT_SMALL).fontSize(9).fillColor(MUTED).text(meta.join("  ·  "));
      if (r.text) doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY).text(sanitizePdfText(r.text), { lineGap: 1 });
      doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED)
        .text(`HASH ${r.hash}${r.attachmentCount ? `  ·  ${r.attachmentCount} adjunto(s)` : ""}`);
      doc.moveDown(0.4); rule(doc); doc.moveDown(0.5);
    }
    if (data.cambios.length) {
      doc.moveDown(0.4);
      doc.font(FONT_BOLD).fontSize(12).fillColor(PRIMARY).text("Solicitudes de cambio");
      doc.moveDown(0.3);
      for (const c of data.cambios) {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY)
          .text(`${c.code}  ·  ${sanitizePdfText(c.title)}  ·  ${c.status}  ·  ${fmt(c.createdAt).slice(0, 10)}`);
        if (c.resolutionNote) doc.font(FONT_SMALL).fontSize(9).fillColor(MUTED).text(sanitizePdfText(c.resolutionNote));
        doc.moveDown(0.3);
      }
    }
  }

  // ── Page numbers ───────────────────────────────────────────────────────────
  const pages = doc.bufferedPageRange().count;
  for (let i = 0; i < pages; i++) {
    doc.switchToPage(i);
    doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED)
      .text(`Pagina ${i + 1} / ${pages}`, 50, doc.page.height - 40, { align: "center", width: doc.page.width - 100 });
  }

  doc.end();
  return done;
}
