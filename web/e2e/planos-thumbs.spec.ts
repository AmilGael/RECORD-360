import { createWriteStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import type { Locator } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs } from "./helpers/auth";
import { setLang, setTheme, type Theme } from "./helpers/prefs";
import { dictionaries, type Lang } from "../src/i18n/dictionaries";
import { OBRA, startsWith } from "./helpers/partida";
import { assertLocalDatabase } from "./setup/carga-load";

const langs: Lang[] = ["es", "en"];
const themes: Theme[] = ["dark", "light"];
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const prisma = new PrismaClient();

async function writeTinyPdf(filePath: string): Promise<void> {
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

async function assertRenderedThumb(img: Locator) {
  await expect(img).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

async function openPlanos(page: Parameters<typeof loginAs>[0], t: (typeof dictionaries)["es"]) {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const href = await obra.getAttribute("href");
  if (!href) throw new Error("obra has no href");
  await page.goto(`${href}?tab=planos`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: t.project.tabPlanos })).toBeVisible();
}

for (const lang of langs) {
  const t = dictionaries[lang];

  for (const theme of themes) {
    test(`Planos cards show names, thumbs and search (${lang}, ${theme})`, async ({ page }, info) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setLang(page, lang);
      await setTheme(page, theme);
      await loginAs(page, "admin");

      const stamp = `${Date.now()}-${info.project.name}`;
      const dir = path.join("e2e", "artifacts", "planos");
      await mkdir(dir, { recursive: true });
      const pdfPath = path.join(dir, `Planta Eléctrica ${stamp}.pdf`);
      const pngPath = path.join(dir, `Q5-detalle-${stamp}.png`);
      await writeTinyPdf(pdfPath);
      await writeFile(pngPath, PNG_1x1);

      await openPlanos(page, t);
      await expect(page.getByLabel(t.planos.title)).toBeVisible();

      const fileInput = page.locator('input[type="file"][name="file"]');
      await fileInput.setInputFiles(pdfPath);
      await page.getByRole("button", { name: t.planos.uploadByKind.PLANO }).click();
      const pdfCard = page.getByRole("link", { name: new RegExp(`Planta Eléctrica ${stamp}`) });
      await expect(pdfCard).toBeVisible({ timeout: 60_000 });
      await assertRenderedThumb(pdfCard.locator("img"));

      await fileInput.setInputFiles(pngPath);
      await page.getByRole("button", { name: t.planos.uploadByKind.PLANO }).click();
      const pngCard = page.getByRole("link", { name: new RegExp(`Q5-detalle-${stamp}`) });
      await expect(pngCard).toBeVisible({ timeout: 60_000 });
      await assertRenderedThumb(pngCard.locator("img"));

      const search = page.getByRole("searchbox", { name: t.planos.search });
      await search.fill("electr");
      await expect(pdfCard).toBeVisible();
      await expect(pngCard).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.get("pq")).toBe("electr");

      await page.screenshot({ path: `e2e/artifacts/planos/grid-${lang}-${theme}-${info.project.name}.png`, fullPage: true });
    });
  }
}

test("backfill creates a thumbnail for a document uploaded without one", async ({ page }, info) => {
  test.setTimeout(90_000);
  const host = assertLocalDatabase();
  expect(["localhost", "127.0.0.1"]).toContain(host);

  const t = dictionaries.es;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "es");
  await setTheme(page, "dark");
  await loginAs(page, "admin");

  const project = await prisma.project.findFirst({ where: { name: OBRA }, select: { id: true, companyId: true } });
  if (!project) throw new Error("E2E Obra Demo is missing; run the @setup fixture.");
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const admin = await prisma.user.findFirst({ where: { email: adminEmail, companyId: project.companyId }, select: { id: true } });
  if (!admin) throw new Error("E2E admin user is missing.");

  const key = `${randomUUID()}.png`;
  const uploads = path.join(process.cwd(), ".uploads");
  await mkdir(uploads, { recursive: true });
  const filePath = path.join(uploads, key);
  await writeFile(filePath, PNG_1x1);

  const stamp = `Q5 backfill ${Date.now()}-${info.project.name}`;
  const doc = await prisma.document.create({
    data: {
      projectId: project.id,
      kind: "PLANO",
      title: null,
      fileName: `${stamp}.png`,
      url: `/api/media/${key}`,
      sha256: "c".repeat(64),
      fileType: "IMAGE",
      uploadedById: admin.id,
    },
  });

  try {
    await openPlanos(page, t);
    const btn = page.getByRole("button", { name: /Generar miniaturas/ });
    await expect(btn).toBeVisible();
    await btn.click();
    const card = page.getByRole("link", { name: startsWith(stamp) });
    await assertRenderedThumb(card.locator("img"));
    await page.screenshot({ path: `e2e/artifacts/planos/backfill-${info.project.name}.png`, fullPage: true });
  } finally {
    const row = await prisma.document.findUnique({ where: { id: doc.id }, select: { thumbKey: true } });
    await prisma.document.deleteMany({ where: { id: doc.id } });
    await unlink(filePath).catch(() => undefined);
    if (row?.thumbKey) {
      await unlink(path.join(uploads, row.thumbKey)).catch(() => undefined);
    }
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
