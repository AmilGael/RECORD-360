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

// R3 WS11: fixed bottom-right footer stamp for the company seal (visual brand
// image, Company.sealKey — NOT the cryptographic record seal/"Sello" string
// stamped per-signature elsewhere). Sized/positioned to stay clear of the QR
// (top-right), the page-number line (bottom-center, y = height-40), and the
// informe firma block (bottom-LEFT, in-flow at x ~ 50).
const SEAL_SIZE = 70;
const SEAL_MARGIN_RIGHT = 50;
const SEAL_BOTTOM_OFFSET = 130; // top edge this far above the page bottom

// Reserved footer band (review IMPORTANT 1): the seal occupies
// y ∈ [height-130, height-60] inside the default text column, and flowing
// body text would otherwise reach down to the old 50px bottom margin and
// paint OVER a seal stamped earlier on the same page. Reserving the band via
// an asymmetric BOTTOM margin makes pdfkit page-break body text above it —
// the seal and the page-number line (explicit-y writes ignore margins) then
// live alone in the band. Used as `margins.bottom` by BOTH pdf builders
// (this file and the partida report route).
export const PAGE_BOTTOM_RESERVED = 140;
// The informe footer block (rule + "Solicitado por" + firma image) needs
// ~100px of writable space to stay together on one page; the addPage guard
// below fires when less than that remains above the reserved band.
const INFORME_FOOTER_BLOCK = 100;

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

/**
 * Stamp the company seal image at a fixed bottom-right position on EVERY page
 * of the document (R3 WS11 — "seal on every page of every export"). A no-op
 * when there is no seal (missing-seal policy: the export still proceeds; the
 * caller/route surfaces that separately, e.g. a response header).
 *
 * `autoFirstPage` creates page 0 before any caller code runs, so the first
 * page can't be caught by a "pageAdded" listener registered after the fact —
 * it is stamped once explicitly here, then the listener covers every
 * subsequent page. Each call embeds sealPng as a fresh image XObject (pdfkit
 * only caches images passed as a string path, not a Buffer), so this does not
 * collapse into a single shared object across pages.
 */
export function stampSealOnEveryPage(doc: InstanceType<typeof PDFDocument>, sealPng: Buffer | null): void {
  if (!sealPng) return;
  const draw = () => {
    const x = doc.page.width - SEAL_MARGIN_RIGHT - SEAL_SIZE;
    const y = doc.page.height - SEAL_BOTTOM_OFFSET;
    doc.image(sealPng, x, y, { fit: [SEAL_SIZE, SEAL_SIZE] });
  };
  draw();
  doc.on("pageAdded", draw);
}

export type InformeRender = {
  contentMd: string;
  requesterName: string;
  firmaPng: Buffer | null;
  /** WS7: audience archetype label shown under the header (e.g. "Audiencia: Propietario"). */
  archetypeLabel?: string | null;
};

export async function buildReportPdf(opts: {
  data: ReportData;
  generatedBy: string;
  informe?: InformeRender;
  /** WS11: company seal (Company.sealKey), stamped on every page. null/undefined = no seal on file. */
  sealPng?: Buffer | null;
}): Promise<Buffer> {
  const { data, generatedBy, informe, sealPng = null } = opts;
  // bufferPages: true — WITHOUT it, pdfkit flushes each page to the output
  // stream as soon as the next page starts, and the page-number loop below
  // (which switchToPage()s back to every page after the whole document is
  // written) throws "out of bounds" on any report spanning more pages than
  // pdfkit's internal window. Pre-existing latent bug (Phase A finding) —
  // it never surfaced because no prior test produced a multi-page report.
  // Asymmetric bottom margin: reserves the seal/page-number band so flowing
  // body text page-breaks above it instead of painting over the seal (see
  // PAGE_BOTTOM_RESERVED).
  const doc = new PDFDocument({
    margins: { top: 50, left: 50, right: 50, bottom: PAGE_BOTTOM_RESERVED },
    size: "A4",
    autoFirstPage: true,
    bufferPages: true,
  });
  const done = collect(doc);

  stampSealOnEveryPage(doc, sealPng);

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
  if (informe?.archetypeLabel) {
    doc.text(`Audiencia: ${sanitizePdfText(informe.archetypeLabel)}`);
  }
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
    // ── Footer block: requester + firma (bottom-left, in-flow). The company
    // seal is NOT repeated here — it is already stamped fixed bottom-right on
    // every page (stampSealOnEveryPage above), so it isn't duplicated on the
    // last page. The guard keeps the whole block on one page: writable space
    // now ends at height - PAGE_BOTTOM_RESERVED (reserved seal band).
    if (doc.y > doc.page.height - (PAGE_BOTTOM_RESERVED + INFORME_FOOTER_BLOCK)) doc.addPage();
    doc.moveDown(1.2);
    rule(doc);
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY).text(`Solicitado por: ${sanitizePdfText(informe.requesterName)}`);
    if (informe.firmaPng) {
      doc.moveDown(0.3);
      doc.image(informe.firmaPng, { fit: [160, 60] });
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
  // The number is painted INTO the reserved bottom band (height - 40), which is
  // deliberately below margins.bottom = PAGE_BOTTOM_RESERVED. pdfkit's text()
  // auto-paginates whenever a write would cross maxY() = height - margins.bottom
  // (A4: 841.89 - 140 = 701.89), so writing at 801.89 appended a brand-new page
  // on EVERY iteration: a 2-page report shipped as 4, the two real pages left
  // unnumbered, and two otherwise-blank pages carrying "Pagina 1 / 2" and
  // "Pagina 2 / 2" — plus a seal each, via the pageAdded hook.
  //
  // Dropping the bottom margin for the duration of the write keeps the number on
  // the page it belongs to. lineBreak:false stops a long label from wrapping
  // into a second line that would overflow again.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const reserved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED)
      .text(`Pagina ${i + 1 - range.start} / ${range.count}`, 50, doc.page.height - 40, {
        align: "center",
        width: doc.page.width - 100,
        lineBreak: false,
      });
    doc.page.margins.bottom = reserved;
  }

  doc.end();
  return done;
}
