import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

/** Writes a one-page 400x300 PDF (a filled rectangle) for upload specs. */
export async function writeTinyPdf(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 300], margin: 0 });
    const out = createWriteStream(filePath);
    doc.pipe(out);
    doc.rect(20, 20, 360, 260).fill("#336699");
    doc.end();
    out.on("finish", resolve);
    out.on("error", reject);
  });
}
