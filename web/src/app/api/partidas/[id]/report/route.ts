// Server-only route: generates a PDF audit report (legal "black box") for a partida.
// Requires an authenticated session with access to the partida's project.
// Uses pdfkit (serverExternalPackages in next.config.ts) so AFM fonts load from disk.
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { verifyChain } from "@/lib/registro/hash";
import { toStored } from "@/lib/registro/map";
import { requireFreshSession } from "@/lib/auth/session";
import { missingSealResponse, parseRangeParam, sanitizeFilename } from "@/lib/report/params";
import { loadCompanySealPng } from "@/lib/report/seal";
import { stampSealOnEveryPage, PAGE_BOTTOM_RESERVED } from "@/lib/report/pdf";
import QRCode from "qrcode";
// pdfkit is listed in serverExternalPackages and must be required at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as typeof import("pdfkit");

function sanitizePdfText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

/** Collect pdfkit's output stream into a single Buffer. */
function collectPdfBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Resolve author names (scoped to the same company for safety)
  try {
    // Auth gate
    const user = await requireFreshSession();
    const sessionUser = { id: user.id, companyId: user.companyId, role: user.role };

    // Parse optional time-range query params
    const url = new URL(req.url);
    const from = parseRangeParam(url, "from");
    const to = parseRangeParam(url, "to");
    if (from === "invalid" || to === "invalid") return new Response("Rango invalido", { status: 400 });
    const hasRange = from !== null || to !== null;
    const fromTo = hasRange
      ? { serverCreatedAt: { gte: from ?? undefined, lte: to ?? undefined } }
      : undefined;

    // Load partida scoped to tenant + project access
    const partida = await prisma.partida.findFirst({
      where: {
        id,
        deletedAt: null,
        project: projectAccessWhere(sessionUser),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            registrationCode: true,
            company: { select: { name: true } },
          },
        },
        registros: {
          where: fromTo,
          orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
          include: {
            attachments: true,
            location: true,
          },
        },
        signatures: { orderBy: { signedAt: "asc" } },
      },
    });
    if (!partida) return new Response("Not found", { status: 404 });

    // Resolve author names (scoped to the same company for safety)
    const authorIds = [...new Set(partida.registros.map((r) => r.authorId))];
    const authors = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds }, companyId: user.companyId },
          select: { id: true, name: true },
        })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a.name]));

    // Resolve requester name for the "Generado por" header line (scoped to same company)
    const requesterRecord = await prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId },
      select: { name: true },
    });
    const requesterName = requesterRecord?.name ?? user.id;

    // Chain integrity check — skip on partial range (would give false negatives)
    const chainStatus = hasRange
      ? "rango parcial (ver reporte completo)"
      : verifyChain(partida.registros.map(toStored)).ok ? "Cadena integra" : "ALTERADA";

    // Progress is stored on the partida itself
    const progressPct = partida.progressPct ?? 0;
    const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    // R3 WS11: company seal on every page, scoped to the caller's own tenant.
    const sealPng = await loadCompanySealPng(user.companyId);
    if (!sealPng) return missingSealResponse();

    // Build PDF. bufferPages: true — without it, pdfkit flushes each page as
    // soon as the next starts and the page-number loop below (which
    // switchToPage()s back to every page) throws "out of bounds" past a
    // couple of pages (pre-existing latent bug, fixed here — see lib/report/pdf.ts).
    // Asymmetric bottom margin: reserves the seal/page-number band so body
    // text page-breaks above it instead of painting over the per-page seal
    // (PAGE_BOTTOM_RESERVED, shared with lib/report/pdf.ts).
    const doc = new PDFDocument({
      margins: { top: 50, left: 50, right: 50, bottom: PAGE_BOTTOM_RESERVED },
      size: "A4",
      autoFirstPage: true,
      bufferPages: true,
    });
    const bufferPromise = collectPdfBuffer(doc);
    stampSealOnEveryPage(doc, sealPng);

  // ── Header ──────────────────────────────────────────────────────────────────
  const FONT_BOLD = "Helvetica-Bold";
  const FONT_NORMAL = "Helvetica";
  const FONT_SMALL = "Helvetica-Oblique";
  const PRIMARY = "#111111";
  const MUTED = "#555555";
  const RULE_COLOR = "#cccccc";

  // QR code top-right (verify URL)
  const qr = await QRCode.toBuffer(
    `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/verify/${partida.project.registrationCode}`,
    { margin: 1, width: 110 },
  );
  doc.image(qr, doc.page.width - 50 - 80, 50, { width: 80 });

  doc.font(FONT_BOLD).fontSize(18).fillColor(PRIMARY).text(sanitizePdfText(partida.project.company.name), 50, 50, { width: doc.page.width - 200 });
  doc.font(FONT_NORMAL).fontSize(11).fillColor(MUTED);
  doc.text(`Obra: ${sanitizePdfText(partida.project.name)}`);
  doc.text(`Partida: ${sanitizePdfText(partida.name)}`);
  doc.font(FONT_NORMAL).fontSize(10);
  doc.text(`Codigo de Registro: ${partida.project.registrationCode}`);
  doc.moveDown(0.3);
  doc.font(FONT_NORMAL).fontSize(10).fillColor(MUTED);
  doc.text(`Avance: ${progressPct}%`);
  doc.text(`Generado: ${generatedAt}  ·  por ${sanitizePdfText(requesterName)}`);
  doc.text(`Integridad: ${chainStatus}`);
  doc.text(`Registros: ${partida.registros.length}`);
  doc.moveDown(0.5);

  // Thick separator under header
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#333333")
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.8);

  // ── Per-registro blocks ───────────────────────────────────────────────────
  for (const r of partida.registros) {
    const date = r.serverCreatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const authorName = sanitizePdfText(authorMap.get(r.authorId) ?? r.authorId);

    // fecha · autor
    doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY);
    doc.text(`${date}  ·  ${authorName}`);

    // category / location / GPS line (omit empties)
    const metaParts: string[] = [];
    if (r.category) metaParts.push(sanitizePdfText(r.category));
    if (r.location?.label) metaParts.push(`Ubic: ${sanitizePdfText(r.location.label)}`);
    if (r.gpsLat !== null && r.gpsLng !== null) {
      metaParts.push(`GPS: ${Number(r.gpsLat).toFixed(6)}, ${Number(r.gpsLng).toFixed(6)}`);
    }
    if (metaParts.length) {
      doc.font(FONT_SMALL).fontSize(9).fillColor(MUTED);
      doc.text(metaParts.join("  ·  "));
    }

    // text body
    if (r.text) {
      doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY);
      doc.text(sanitizePdfText(r.text), { lineGap: 1 });
    }

    // hash + attachment count
    doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED);
    const attLine = r.attachments.length > 0 ? `  ·  ${r.attachments.length} adjunto(s)` : "";
    doc.text(`HASH ${r.hash}${attLine}`);

    // thin rule separator
    doc.moveDown(0.4);
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor(RULE_COLOR)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.5);
  }

  // ── Firmas (sign-offs) ─────────────────────────────────────────────────────
  doc.moveDown(0.4);
  doc.font(FONT_BOLD).fontSize(12).fillColor(PRIMARY).text("Firmas");
  doc.moveDown(0.3);
  if (partida.signatures.length === 0) {
    doc.font(FONT_SMALL).fontSize(9).fillColor(MUTED).text("Sin firmas.");
  } else {
    for (const s of partida.signatures) {
      const signedAt = s.signedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
      doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY);
      doc.text(`${signedAt}  ·  ${sanitizePdfText(s.signerName)} (${s.signerRole})`);
      if (s.statement) {
        doc.font(FONT_NORMAL).fontSize(10).fillColor(PRIMARY);
        doc.text(sanitizePdfText(s.statement), { lineGap: 1 });
      }
      doc.font(FONT_SMALL).fontSize(8).fillColor(MUTED);
      doc.text(`SELLO ${s.seal}`);
      doc.text(`Estado del Cuaderno: ${s.chainHead || "(vacio)"}`);
      doc.moveDown(0.5);
    }
  }

  // ── Page numbers ─────────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .font(FONT_SMALL)
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Pagina ${i + 1} / ${pageCount}`, 50, doc.page.height - 40, {
        align: "center",
        width: doc.page.width - 100,
      });
  }

    doc.end();
    const pdfBuffer = await bufferPromise;

    // Filename: <obra>-<partida>-<YYYY-MM-DD>.pdf
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizeFilename(partida.project.name)}-${sanitizeFilename(partida.name)}-${today}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    if (error instanceof Error && error.message === "Forbidden") return new Response("Forbidden", { status: 403 });
    const message = error instanceof Error ? error.message : "Error";
    return new Response(message, { status: 500 });
  }
}
