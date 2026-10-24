import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/guards";
import { loginAs, signOut } from "./helpers/auth";
import { setLang, setTheme } from "./helpers/prefs";
import { dictionaries } from "../src/i18n/dictionaries";
import { BLOQUE, OBRA, sdLocalInput, startsWith } from "./helpers/partida";
import { assertNoHorizontalOverflow, assertServerClean, collectServerErrors } from "./helpers/watch";

// Q10 office journey, Spanish, day. The plano is generated over 5 MB. Local
// storage has no presign, so the bytes take the server-action fallback.
// Rechazar, not Integrar: integrating writes a registro on every partida in
// the bloque, and e2e registros stay in "Pruebas automáticas".

const t = dictionaries.es;
const FIVE_MB = 5 * 1024 * 1024;

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "the manager journey is the desktop project");
});

async function writeLargePdf(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 300], margin: 0 });
    const out = createWriteStream(filePath);
    doc.pipe(out);
    doc.rect(20, 20, 360, 260).fill("#336699");
    doc.end();
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
  // Comment lines after %%EOF keep page 1 renderable and push the file past
  // 5 MB. pdf.js seeks startxref from the end and skips these.
  const size = (await stat(filePath)).size;
  const pad = Buffer.alloc(200, 0x20);
  const extra: Buffer[] = [];
  let n = size;
  while (n <= FIVE_MB) {
    extra.push(Buffer.from("\n%"));
    extra.push(pad);
    n += pad.length + 2;
  }
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(filePath, { flags: "a" });
    out.on("finish", () => resolve());
    out.on("error", reject);
    out.end(Buffer.concat(extra));
  });
}

async function shot(page: Page, name: string) {
  await mkdir("e2e/artifacts/journey-manager", { recursive: true });
  await page.screenshot({ path: `e2e/artifacts/journey-manager/${name}.png`, fullPage: true });
}

async function openObra(page: Page, tab: string): Promise<string> {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const obra = page.getByRole("link", { name: startsWith(OBRA) }).first();
  await expect(obra).toBeVisible();
  const href = await obra.getAttribute("href");
  if (!href) throw new Error("obra has no href");
  const pathOnly = new URL(href, "http://localhost").pathname;
  await page.goto(`${pathOnly}?tab=${tab}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: OBRA })).toBeVisible();
  return pathOnly;
}

test("manager: plano, critical alert, resident inbox, analítica, informes", async ({ page }) => {
  test.setTimeout(300_000);
  const serverErrors = collectServerErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setLang(page, "es");
  await setTheme(page, "light");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 18.4861, longitude: -69.9312 });

  const stamp = `${Date.now()}`;
  const planoName = `Q10-plano-${stamp}.pdf`;
  const title = `Q10 alerta ${stamp}`;
  const dir = path.join("e2e", "artifacts", "journey-manager");
  const pdfPath = path.join(dir, planoName);
  await writeLargePdf(pdfPath);
  expect((await stat(pdfPath)).size).toBeGreaterThan(FIVE_MB);

  await loginAs(page, "admin");
  const obraPath = await openObra(page, "planos");
  await page.locator('input[type="file"][name="file"]').setInputFiles(pdfPath);
  await page.getByRole("button", { name: t.planos.upload }).click();
  const card = page.getByRole("link", { name: new RegExp(planoName.replace(".", "\\.")) });
  await expect(card).toBeVisible({ timeout: 90_000 });
  const thumb = card.locator("img");
  await expect(thumb).toBeVisible();
  await expect.poll(async () => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await shot(page, "plano");
  await assertNoHorizontalOverflow(page, "Planos");

  await page.goto(`${obraPath}?tab=cambios`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: t.requests.kindAlert }).check();
  await page.getByRole("radio", { name: t.requests.severityCritical }).check();
  await page.getByPlaceholder(t.changes.fieldTitle).fill(title);
  await page.locator('select[name="segmentIds"]').selectOption({ label: BLOQUE });
  await page.locator('input[name="reminderDueAt"]').fill(sdLocalInput(2));
  await expect(page.getByText(t.requests.gpsAcquired)).toBeVisible({ timeout: 15_000 });
  const submit = page.getByRole("button", { name: t.changes.new });
  await expect(submit).toBeEnabled();
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await submit.click();
  expect((await posted).status()).toBeLessThan(500);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible({ timeout: 20_000 });
  await shot(page, "alert");
  await assertNoHorizontalOverflow(page, "Solicitudes");

  await signOut(page);
  await loginAs(page, "resident");
  await page.goto("/app/notifications");
  await page.waitForLoadState("networkidle");
  const unread = page.getByRole("region", { name: /^Sin leer/ });
  await expect(unread).toBeVisible();
  await expect(unread.getByRole("link").first()).toContainText(title);
  await shot(page, "resident-unread");
  await assertNoHorizontalOverflow(page, "Notificaciones");

  await signOut(page);
  await loginAs(page, "admin");
  await page.goto(`${obraPath}?tab=analitica`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: t.project.analitica.weeklyTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.project.analitica.statusTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: t.project.analitica.authorsTitle })).toBeVisible();
  const charts = page.locator("section.analitica-chart");
  await expect(charts).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const chart = charts.nth(i);
    await expect(chart.getByRole("img")).toBeVisible();
    await chart.getByText(t.project.analitica.viewData, { exact: true }).click();
    await expect(chart.locator("table tbody tr").first()).toBeVisible();
  }
  const alerts = page.locator("section.analitica-alerts");
  await expect(alerts.getByRole("heading", { name: t.project.analitica.alertsTitle })).toBeVisible();
  const alertLink = alerts.getByRole("link", { name: title });
  await expect(alertLink).toBeVisible();
  await shot(page, "analitica");
  await assertNoHorizontalOverflow(page, "Analítica");

  await alertLink.click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/cambios\//, { timeout: 20_000 });
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  const reject = page.locator("form").filter({ has: page.getByRole("button", { name: t.changes.reject, exact: true }) });
  await reject.getByLabel(t.changes.resolutionNote).fill(`Q10 cierre ${stamp}`);
  const resolved = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await reject.getByRole("button", { name: t.changes.reject, exact: true }).click();
  expect((await resolved).status()).toBeLessThan(500);
  await expect(page.getByText(t.changes.states.REJECTED, { exact: true })).toBeVisible();

  await page.goto(`${obraPath}?tab=analitica`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("section.analitica-alerts").getByRole("link", { name: title })).toHaveCount(0);

  await page.goto(`${obraPath}?tab=informes`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(t.informes.empty, { exact: true })).toBeVisible();
  await shot(page, "informes");
  await assertNoHorizontalOverflow(page, "Informes");
  assertServerClean(serverErrors);
});
