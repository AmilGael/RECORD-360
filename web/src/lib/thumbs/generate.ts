/**
 * Browser-only. Loaded with a dynamic import so Node tests and the server
 * never pull pdfjs-dist. A failed miniature must never block the upload.
 */

const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const LONG_SIDE = 480;

export async function generateThumbnail(file: File): Promise<Blob | null> {
  if (file.size > MAX_BYTES) return null;
  const work = run(file).catch(() => null);
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), TIMEOUT_MS);
  });
  return Promise.race([work, timeout]);
}

async function run(file: File): Promise<Blob | null> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return pdfThumb(file);
  if (file.type.startsWith("image/")) return imageThumb(file);
  return null;
}

async function imageThumb(file: File): Promise<Blob | null> {
  const bmp = await createImageBitmap(file);
  try {
    const longest = Math.max(bmp.width, bmp.height) || 1;
    const scale = longest > LONG_SIDE ? LONG_SIDE / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvasToThumb(canvas);
  } finally {
    bmp.close();
  }
}

async function pdfThumb(file: File): Promise<Blob | null> {
  // Legacy build + worker from our origin. v5+ needs Node 22; 4.10.38 is the
  // pin. Import inside the function so a server/test graph never loads it.
  // Do not add pdfjs-dist to transpilePackages: SWC injects @swc/helpers
  // specifiers the fake-worker path cannot resolve.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  // Production CSP forbids eval; pdf.js will try it unless this is false.
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = base.width > 0 ? LONG_SIDE / base.width : 1;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // pdfjs 4.10.38 throws "Canvas is not specified" unless the element is passed;
  // the bundled types for this pin omit that field.
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  return canvasToThumb(canvas);
}

function canvasToThumb(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob && blob.type === "image/webp") {
        resolve(blob);
        return;
      }
      // Older iOS reports a different type (or null) for webp.
      canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", 0.82);
    }, "image/webp", 0.8);
  });
}
