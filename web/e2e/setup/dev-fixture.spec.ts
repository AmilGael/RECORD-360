import { test, expect } from "../helpers/guards";
import { credentialsFor, loginAs } from "../helpers/auth";
import { setLang } from "../helpers/prefs";
import { dictionaries } from "../../src/i18n/dictionaries";

// Permanent local demo data for later quests. Run with:
//   E2E_SETUP=1 npx playwright test --grep @setup --project desktop
// Each step checks before it writes, so a rerun only completes what an
// interrupted run left missing and writes nothing once the fixture is whole.
const OBRA = "E2E Obra Demo";
const BLOQUES: Record<string, string[]> = {
  "Cocina": ["Demolición de revestimientos", "Instalación eléctrica", "Plomería y desagües", "Gabinetes y encimera"],
  "Lavandería": ["Impermeabilización de piso", "Circuito eléctrico dedicado", "Tomas de agua y desagüe", "Cerámica de pared"],
  "Sala": ["Resanado de muros", "Cielo raso de yeso", "Piso porcelanato", "Pintura general"],
};

const t = dictionaries.es;
const startsWith = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

test("creates the E2E Obra Demo fixture @setup", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const baseURL = testInfo.project.use.baseURL ?? "";
  const host = new URL(baseURL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to write fixture data to ${baseURL}: E2E_BASE_URL must be localhost.`);
  }
  const residentEmail = credentialsFor("resident").email;
  const created: string[] = [];

  await setLang(page, "es");
  await loginAs(page, "admin");
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: t.dash.title })).toBeVisible();

  const obraLink = page.getByRole("link", { name: startsWith(OBRA) });
  if ((await obraLink.count()) === 0) {
    const nameInput = page.getByLabel(`${t.dash.newSite} *`);
    if (!(await nameInput.isVisible())) await page.getByText(t.dash.panelTitle, { exact: true }).click();
    await nameInput.fill(OBRA);
    await page.getByRole("button", { name: startsWith(t.dash.create) }).click();
    created.push(`obra ${OBRA}`);
  }
  await obraLink.click();
  await page.waitForURL(/\/app\/projects\/[^/?]+$/);
  const projectUrl = new URL(page.url()).pathname;
  // Client navigation updates the URL while loading.tsx is still showing, so
  // existence checks must wait for the rendered page, not the skeleton.
  const bloqueForm = page.getByPlaceholder(t.project.newSegment);
  await expect(bloqueForm).toBeVisible();

  for (const bloque of Object.keys(BLOQUES)) {
    const bloqueLink = page.getByRole("link", { name: startsWith(bloque) });
    if ((await bloqueLink.count()) > 0) continue;
    await bloqueForm.fill(bloque);
    await page.getByRole("button", { name: t.project.addSegment, exact: true }).click();
    await expect(bloqueLink).toBeVisible();
    created.push(`bloque ${bloque}`);
  }

  for (const [bloque, partidas] of Object.entries(BLOQUES)) {
    await page.goto(projectUrl);
    await page.getByRole("link", { name: startsWith(bloque) }).click();
    await page.waitForURL(/[?&]block=/);
    const partidaForm = page.getByPlaceholder(t.project.newPartida);
    await expect(partidaForm).toBeVisible();
    for (const partida of partidas) {
      const partidaLink = page.getByRole("link", { name: startsWith(partida) });
      if ((await partidaLink.count()) > 0) continue;
      await partidaForm.fill(partida);
      await page.getByRole("button", { name: t.project.add, exact: true }).click();
      await expect(partidaLink).toBeVisible();
      created.push(`partida ${bloque} / ${partida}`);
    }
  }

  await page.goto(projectUrl);
  await expect(page.getByRole("button", { name: t.project.assign, exact: true })).toBeVisible();
  const assigned = page.getByText(residentEmail, { exact: true });
  if ((await assigned.count()) === 0) {
    await page.getByRole("combobox").filter({ has: page.getByRole("option", { name: t.project.resident, exact: true }) })
      .selectOption("RESIDENT");
    const userSelect = page.getByRole("combobox").filter({ has: page.getByRole("option", { name: residentEmail }) });
    const residentValue = await userSelect.getByRole("option", { name: residentEmail }).getAttribute("value");
    if (!residentValue) throw new Error("The resident account is not offered for assignment on this obra.");
    await userSelect.selectOption(residentValue);
    await page.getByRole("button", { name: t.project.assign, exact: true }).click();
    await expect(assigned).toBeVisible();
    created.push("resident assignment");
  }

  testInfo.annotations.push({
    type: "fixture",
    description: created.length ? `created: ${created.join(", ")}` : `${OBRA} already complete; nothing written.`,
  });
});
