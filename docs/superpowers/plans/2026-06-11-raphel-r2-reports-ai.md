# Raphel R2 — Reports + AI Informes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R2 of the round-2 spec: deterministic time-range PDF reports at obra/bloque/partida level (with registrationCode + QR header), and the AI Informes generator (Claude `claude-sonnet-4-6`, fixed report format, requester firma + company seal in the footer, persisted and re-downloadable).

**Architecture:** A shared `lib/report/` layer: `data.ts` assembles tenant-scoped, time-ranged report data for any scope; `pdf.ts` renders it with pdfkit (QR via `qrcode` Buffer, firma/seal images streamed from storage). New routes `/api/projects/[id]/report` and `/api/segments/[id]/report` use the shared builder; the existing partida route gains `from`/`to` params + the code/QR header **in place** (its bespoke legal layout and tests stay — deliberate non-refactor of the audited path). AI side: `lib/informes/` (fixed-format prompt + thin Anthropic client wrapper, mocked in tests), an `Informe` Prisma model (the spec's "Report" table — renamed to avoid colliding with the deterministic report routes), a `createInforme` server action returning structured results, and an Informes tab in the project workspace.

**Tech Stack:** Next.js 15 App Router, Prisma 6, pdfkit (already in `serverExternalPackages`), `qrcode`, `@anthropic-ai/sdk` (new), vitest (real Postgres, `vi.mock("@/auth")` pattern).

**Spec:** `docs/superpowers/specs/2026-06-11-raphel-architect-feedback-round2-design.md` §R2
**Working directory:** `/Users/genel/Mirror/RECORD-360/web`. Branch: `feat/web-security-hardening`.

**Hard rules:** every user-facing string in BOTH `es`/`en` dictionary blocks; NO emoji; all data access through `projectAccessWhere` (archived obras already excluded for restricted roles); the AI client is `claude-sonnet-4-6` with `thinking: {type:"disabled"}` + `output_config: {effort:"low"}` (locked decision D2 — speed over depth for a serverless-bounded call; do NOT change the model string).

**Deploy note (record, don't solve):** generation takes ~10–30 s. Fine in dev/tunnel and within Netlify Pro's 26 s function ceiling at `max_tokens: 4096`, but tight — if production timeouts appear, the follow-up is a background-function or streaming pattern. A code comment in the action notes this.

---

### Task 1: `@anthropic-ai/sdk` + `Informe` model migration

**Files:**
- Modify: `package.json` (dep), `prisma/schema.prisma`
- Create: migration `r2_informes`

- [ ] **Step 1:** `npm install @anthropic-ai/sdk`

- [ ] **Step 2:** Schema. In `prisma/schema.prisma` add after the `Document` model:

```prisma
// AI-generated informe (spec R2.2 "Report" table). Deterministic PDF reports are
// stateless routes; informes persist because they are auditable deliverables.
model Informe {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id])
  segmentId     String?
  partidaId     String?
  requestedById String
  brief         String
  periodFrom    DateTime?
  periodTo      DateTime?
  contentMd     String
  model         String
  createdAt     DateTime @default(now())

  @@index([projectId, createdAt])
}
```

And add `informes Informe[]` to the `Project` model's relation list.

- [ ] **Step 3:** Migrate: `npx prisma migrate dev --name r2_informes` (if no TTY, create the migration dir manually with the SQL Prisma would emit — plain CREATE TABLE + index + FK — and apply with `npx prisma migrate deploy`; confirm `npx prisma migrate status` is clean).

- [ ] **Step 4:** `npm test` (additive — all green) and commit:

```bash
git add -A && git commit -m "feat(r2): Informe model + @anthropic-ai/sdk dependency"
```

---

### Task 2: Report data assembly (TDD)

**Files:**
- Create: `src/lib/report/data.ts`
- Test: `tests/report-data.test.ts`

- [ ] **Step 1: Failing tests** — create `tests/report-data.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assembleReportData } from "@/lib/report/data";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

let companyId = "", managerId = "", outsiderCompanyId = "", outsiderId = "";
let projectId = "", segmentAId = "", segmentBId = "", partidaA1Id = "", partidaB1Id = "";

const T0 = new Date("2026-01-10T12:00:00Z");
const T1 = new Date("2026-02-10T12:00:00Z");

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `RD Co ${s}` } })).id;
  outsiderCompanyId = (await prisma.company.create({ data: { name: `RD Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Gerente RD", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outsiderCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `RD Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  segmentAId = (await prisma.segment.create({ data: { projectId, name: "Bloque A" } })).id;
  segmentBId = (await prisma.segment.create({ data: { projectId, name: "Bloque B" } })).id;
  partidaA1Id = (await prisma.partida.create({ data: { projectId, segmentId: segmentAId, name: "Zapatas A1", progressPct: 40 } })).id;
  partidaB1Id = (await prisma.partida.create({ data: { projectId, segmentId: segmentBId, name: "Muros B1", progressPct: 10 } })).id;

  // Two registros in partida A1 at controlled times, one in B1
  for (const [partidaId, text, at] of [
    [partidaA1Id, "Vaciado enero", T0],
    [partidaA1Id, "Curado febrero", T1],
    [partidaB1Id, "Muro enero", T0],
  ] as const) {
    await appendRegistro({
      partidaId, authorId: managerId, text, category: null,
      progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [],
      serverCreatedAt: at,
    } as Parameters<typeof appendRegistro>[0]);
  }
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { project: { companyId } } } });
  await prisma.partida.deleteMany({ where: { project: { companyId } } });
  await prisma.segment.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outsiderCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outsiderCompanyId] } } });
});

const mgr = () => ({ id: managerId, companyId, role: "MANAGER" as const });

describe("assembleReportData — scope", () => {
  it("project scope includes all partidas' registros, newest data complete", async () => {
    const d = await assembleReportData(mgr(), { type: "project", id: projectId }, null, null);
    expect(d.project.registrationCode).toMatch(/^RPH-/);
    expect(d.registros.map((r) => r.text)).toEqual(expect.arrayContaining(["Vaciado enero", "Curado febrero", "Muro enero"]));
    expect(d.partidas.length).toBe(2);
    expect(d.scopeLabel).toContain("Obra");
  });
  it("segment scope only includes that bloque's registros", async () => {
    const d = await assembleReportData(mgr(), { type: "segment", id: segmentAId }, null, null);
    expect(d.registros.map((r) => r.text)).toEqual(expect.arrayContaining(["Vaciado enero", "Curado febrero"]));
    expect(d.registros.map((r) => r.text)).not.toContain("Muro enero");
    expect(d.scopeLabel).toContain("Bloque A");
  });
  it("partida scope narrows to one partida", async () => {
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaB1Id }, null, null);
    expect(d.registros.map((r) => r.text)).toEqual(["Muro enero"]);
    expect(d.scopeLabel).toContain("Muros B1");
  });
});

describe("assembleReportData — time range", () => {
  it("from/to filters registros by serverCreatedAt", async () => {
    const d = await assembleReportData(mgr(), { type: "project", id: projectId }, new Date("2026-02-01"), new Date("2026-02-28"));
    expect(d.registros.map((r) => r.text)).toEqual(["Curado febrero"]);
  });
});

describe("assembleReportData — tenancy", () => {
  it("outsider company gets null", async () => {
    const d = await assembleReportData({ id: outsiderId, companyId: outsiderCompanyId, role: "MANAGER" }, { type: "project", id: projectId }, null, null);
    expect(d).toBeNull();
  });
  it("author names are resolved", async () => {
    const d = await assembleReportData(mgr(), { type: "partida", id: partidaA1Id }, null, null);
    expect(d!.registros[0]!.authorName).toBe("Gerente RD");
  });
});
```

IMPORTANT: read `src/lib/registro/append.ts` first — `appendRegistro`'s exact input type and whether `serverCreatedAt` can be injected. If it cannot (server-stamped), create the registros via `appendRegistro` normally and then `prisma.registro.update({ where: { id }, data: { serverCreatedAt: T0 } })` to set the controlled times (timestamps aren't part of `computeHash`? — CHECK `src/lib/registro/hash.ts`; if serverCreatedAt IS hashed, instead pick from/to around `new Date()` boundaries: create two registros, capture `serverCreatedAt` of each, and filter between them — adapt the range test accordingly rather than mutating hashed fields).

- [ ] **Step 2: Run — fail.** `npx vitest run tests/report-data.test.ts`

- [ ] **Step 3: Implement** — create `src/lib/report/data.ts`:

```ts
import { prisma } from "@/lib/db";
import { projectAccessWhere, type SessionUser } from "@/lib/authz/projects";

export type ReportScope =
  | { type: "project"; id: string }
  | { type: "segment"; id: string }
  | { type: "partida"; id: string };

export type ReportRegistro = {
  partidaName: string;
  serverCreatedAt: Date;
  authorName: string;
  category: string | null;
  locationLabel: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  text: string | null;
  hash: string;
  attachmentCount: number;
};

export type ReportData = {
  project: { id: string; name: string; registrationCode: string; companyName: string };
  scopeLabel: string;
  from: Date | null;
  to: Date | null;
  partidas: { name: string; progressPct: number; segmentName: string | null }[];
  registros: ReportRegistro[];
  cambios: { code: string; title: string; status: string; createdAt: Date; resolutionNote: string | null }[];
};

/**
 * Assemble tenant-scoped, time-ranged data for a report at any of the three
 * levels. Returns null when the scope isn't visible to the caller — the caller
 * maps that to 404 (no existence oracle). All access flows through
 * projectAccessWhere (company + assignment + archived rules).
 */
export async function assembleReportData(
  user: SessionUser,
  scope: ReportScope,
  from: Date | null,
  to: Date | null,
): Promise<ReportData | null> {
  const accessWhere = projectAccessWhere(user);

  // Resolve the scope to a project + optional narrowing + label.
  let projectId: string;
  let partidaWhere: { segmentId?: string; id?: string } = {};
  let scopeLabel: string;

  if (scope.type === "project") {
    const p = await prisma.project.findFirst({ where: { id: scope.id, ...accessWhere }, select: { id: true } });
    if (!p) return null;
    projectId = p.id;
    scopeLabel = "Obra completa";
  } else if (scope.type === "segment") {
    const seg = await prisma.segment.findFirst({
      where: { id: scope.id, project: accessWhere },
      select: { id: true, name: true, projectId: true },
    });
    if (!seg) return null;
    projectId = seg.projectId;
    partidaWhere = { segmentId: seg.id };
    scopeLabel = `Bloque: ${seg.name}`;
  } else {
    const pa = await prisma.partida.findFirst({
      where: { id: scope.id, deletedAt: null, project: accessWhere },
      select: { id: true, name: true, projectId: true },
    });
    if (!pa) return null;
    projectId = pa.projectId;
    partidaWhere = { id: pa.id };
    scopeLabel = `Partida: ${pa.name}`;
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, name: true, registrationCode: true, company: { select: { name: true } } },
  });

  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  const [partidas, registros, cambios] = await Promise.all([
    prisma.partida.findMany({
      where: { projectId, deletedAt: null, ...partidaWhere },
      orderBy: { createdAt: "asc" },
      select: { name: true, progressPct: true, segment: { select: { name: true } } },
    }),
    prisma.registro.findMany({
      where: {
        partida: { projectId, deletedAt: null, ...partidaWhere },
        ...(dateFilter ? { serverCreatedAt: dateFilter } : {}),
      },
      orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
      select: {
        serverCreatedAt: true, authorId: true, category: true, text: true, hash: true,
        gpsLat: true, gpsLng: true,
        location: { select: { label: true } },
        partida: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    }),
    // Cambios are obra-level (bloque-scoped via join table) — include them for
    // project scope; for narrower scopes include those touching the bloque.
    prisma.changeRequest.findMany({
      where: {
        projectId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(scope.type === "segment" ? { segments: { some: { segmentId: scope.id } } } : {}),
        ...(scope.type === "partida" ? { partidas: { some: { partidaId: scope.id } } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { code: true, title: true, status: true, createdAt: true, resolutionNote: true },
    }),
  ]);

  const authorIds = [...new Set(registros.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds }, companyId: user.companyId }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  return {
    project: { id: project.id, name: project.name, registrationCode: project.registrationCode, companyName: project.company.name },
    scopeLabel,
    from,
    to,
    partidas: partidas.map((p) => ({ name: p.name, progressPct: p.progressPct, segmentName: p.segment?.name ?? null })),
    registros: registros.map((r) => ({
      partidaName: r.partida.name,
      serverCreatedAt: r.serverCreatedAt,
      authorName: authorMap.get(r.authorId) ?? r.authorId,
      category: r.category,
      locationLabel: r.location?.label ?? null,
      gpsLat: r.gpsLat === null ? null : Number(r.gpsLat),
      gpsLng: r.gpsLng === null ? null : Number(r.gpsLng),
      text: r.text,
      hash: r.hash,
      attachmentCount: r._count.attachments,
    })),
    cambios,
  };
}
```

(Adjust the test's `toBeNull` expectations: the function returns `null` for invisible scopes — the first tenancy test asserts `d` is null, the second uses `d!`. Keep types satisfied.)

- [ ] **Step 4: Run — pass; full suite.** `npx vitest run tests/report-data.test.ts && npm test`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(r2): shared time-range report data assembly for obra/bloque/partida scopes (R2.1)"
```

---

### Task 3: Shared PDF builder

**Files:**
- Create: `src/lib/report/pdf.ts`
- Test: `tests/report-pdf.test.ts`

- [ ] **Step 1: Failing test** — create `tests/report-pdf.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — fail.** Then implement `src/lib/report/pdf.ts`:

```ts
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
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
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
```

- [ ] **Step 3: Run — pass; commit**

```bash
npx vitest run tests/report-pdf.test.ts
git add -A && git commit -m "feat(r2): shared pdfkit report builder with code+QR header and informe mode (R2.1/R2.2)"
```

---

### Task 4: Deterministic report routes (TDD)

**Files:**
- Create: `src/app/api/projects/[id]/report/route.ts`, `src/app/api/segments/[id]/report/route.ts`
- Modify: `src/app/api/partidas/[id]/report/route.ts` (from/to params + code/QR header lines)
- Test: `tests/scoped-report-routes.test.ts`; Modify: `tests/report-route.test.ts` only if its assertions break

- [ ] **Step 1: Failing tests** — create `tests/scoped-report-routes.test.ts` (mirror the auth-mock + fixture pattern at the top of `tests/report-route.test.ts` — company A with manager + project + segment + partida + one registro via `appendRegistro`, company B outsider):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET as projectReport } from "@/app/api/projects/[id]/report/route";
import { GET as segmentReport } from "@/app/api/segments/[id]/report/route";

let companyAId = "", companyBId = "", managerAId = "", userBId = "", projectAId = "", segmentAId = "", partidaAId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyAId = (await prisma.company.create({ data: { name: `SR Co A ${s}` } })).id;
  companyBId = (await prisma.company.create({ data: { name: `SR Co B ${s}` } })).id;
  managerAId = (await prisma.user.create({ data: { email: `sr-a-${s}@x.do`, name: "Mgr A", role: "MANAGER", companyId: companyAId, passwordHash: "x" } })).id;
  userBId = (await prisma.user.create({ data: { email: `sr-b-${s}@x.do`, name: "Usr B", role: "MANAGER", companyId: companyBId, passwordHash: "x" } })).id;
  projectAId = (await prisma.project.create({ data: { companyId: companyAId, name: `SR Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  segmentAId = (await prisma.segment.create({ data: { projectId: projectAId, name: "Bloque SR" } })).id;
  partidaAId = (await prisma.partida.create({ data: { projectId: projectAId, segmentId: segmentAId, name: "Partida SR" } })).id;
  await appendRegistro({ partidaId: partidaAId, authorId: managerAId, text: "registro sr", category: null, progressPct: null, gpsLat: null, gpsLng: null, locationId: null, attachments: [] } as Parameters<typeof appendRegistro>[0]);
});

afterAll(async () => {
  await prisma.registro.deleteMany({ where: { partida: { project: { companyId: companyAId } } } });
  await prisma.partida.deleteMany({ where: { project: { companyId: companyAId } } });
  await prisma.segment.deleteMany({ where: { projectId: projectAId } });
  await prisma.project.deleteMany({ where: { companyId: companyAId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
});

function call(fn: typeof projectReport, id: string, qs = "") {
  return fn(new Request(`http://test/x${qs}`), { params: Promise.resolve({ id }) });
}

describe("scoped report routes", () => {
  it("project report returns a PDF for a company member", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    const res = await call(projectReport, projectAId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
  it("segment report returns a PDF and honors from/to params", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    const res = await call(segmentReport, segmentAId, "?from=2020-01-01&to=2030-01-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
  it("cross-tenant access is a 404 on both routes", async () => {
    authMock.mockResolvedValue({ user: { id: userBId, companyId: companyBId, role: "MANAGER" } });
    expect((await call(projectReport, projectAId)).status).toBe(404);
    expect((await call(segmentReport, segmentAId)).status).toBe(404);
  });
  it("garbage date params are rejected with 400", async () => {
    authMock.mockResolvedValue({ user: { id: managerAId, companyId: companyAId, role: "MANAGER" } });
    expect((await call(projectReport, projectAId, "?from=not-a-date")).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — fail.** Then create `src/app/api/projects/[id]/report/route.ts`:

```ts
// Deterministic time-range PDF report for a whole obra (R2.1).
import { assembleReportData } from "@/lib/report/data";
import { buildReportPdf } from "@/lib/report/pdf";
import { requireFreshSession } from "@/lib/auth/session";

export function parseRangeParam(url: URL, key: "from" | "to"): Date | null | "invalid" {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function sanitizeFilename(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-").slice(0, 80);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const user = await requireFreshSession();
    const url = new URL(req.url);
    const from = parseRangeParam(url, "from");
    const to = parseRangeParam(url, "to");
    if (from === "invalid" || to === "invalid") return new Response("Rango invalido", { status: 400 });

    const data = await assembleReportData(
      { id: user.id, companyId: user.companyId, role: user.role },
      { type: "project", id },
      from, to,
    );
    if (!data) return new Response("Not found", { status: 404 });

    const requester = await import("@/lib/db").then(({ prisma }) =>
      prisma.user.findFirst({ where: { id: user.id }, select: { name: true } }));
    const pdf = await buildReportPdf({ data, generatedBy: requester?.name ?? "—" });
    const filename = `${sanitizeFilename(data.project.name)}-reporte-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    if (e instanceof Error && e.message === "Forbidden") return new Response("Forbidden", { status: 403 });
    return new Response("Error", { status: 500 });
  }
}
```

REFINEMENT while implementing: move `parseRangeParam` + `sanitizeFilename` into `src/lib/report/params.ts` (export both) and import them in all three routes instead of exporting helpers from a route file (route files should only export HTTP handlers — Next.js will fail the build on extra exports). The segment route `src/app/api/segments/[id]/report/route.ts` is identical except `{ type: "segment", id }` and the filename uses `data.scopeLabel`.

- [ ] **Step 3:** Extend the partida route: in `src/app/api/partidas/[id]/report/route.ts`, (a) parse `from`/`to` with the same `parseRangeParam` (import from `@/lib/report/params`), 400 on invalid; (b) thread them into the registros include:

```ts
        registros: {
          where: fromTo,            // build: const fromTo = from || to ? { serverCreatedAt: { gte: from ?? undefined, lte: to ?? undefined } } : undefined;
          orderBy: [{ serverCreatedAt: "asc" }, { id: "asc" }],
          include: { attachments: true, location: true },
        },
```

(c) select `registrationCode` on the project include and add to the header block after the Partida line:

```ts
  doc.text(`Codigo de Registro: ${partida.project.registrationCode}`);
```

(d) embed the QR top-right exactly as the shared builder does (import QRCode from "qrcode", `QRCode.toBuffer(...verify URL..., { margin: 1, width: 110 })`, `doc.image(qr, doc.page.width - 50 - 80, 50, { width: 80 })` placed BEFORE the header text calls so the text wraps within `width: doc.page.width - 200`).
NOTE: when a range is active, the chain-verification line is misleading (partial chain) — compute `chainStatus` only when NO range is given; with a range, print `Integridad: rango parcial (ver reporte completo)` instead.

- [ ] **Step 4: Run everything**

```bash
npx vitest run tests/scoped-report-routes.test.ts tests/report-route.test.ts && npm test && npm run build
```

(If `tests/report-route.test.ts` breaks on the new header line, update its assertions accordingly — say so in the commit.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(r2): obra/bloque report routes; partida report gains time range + code/QR header (R2.1)"
```

---

### Task 5: Informes engine — prompt, client, action (TDD)

**Files:**
- Create: `src/lib/informes/prompt.ts`, `src/lib/informes/client.ts`, `src/app/actions/informes.ts`
- Test: `tests/informes-action.test.ts`

- [ ] **Step 1: Prompt module** — create `src/lib/informes/prompt.ts`:

```ts
import type { ReportData } from "@/lib/report/data";

/**
 * Fixed report format (spec R2.2): the informe always carries these sections,
 * in Spanish, regardless of what the user asks for in the brief.
 */
export const INFORME_SYSTEM = `Eres el redactor tecnico de Raphel, la bitacora digital inalterable de obras de construccion en la Republica Dominicana.
Redactas informes ejecutivos de obra en espanol, sobrios y precisos, SOLO con los datos proporcionados — nunca inventes hechos, cifras ni fechas.
Formato OBLIGATORIO (markdown simple, sin tablas ni enlaces ni emojis):
# Resumen Ejecutivo
# Avance de Obra
# Eventualidades y Observaciones
# Solicitudes de Cambio
# Recomendaciones
Si una seccion no tiene datos, escribe "Sin novedades en el periodo."
Maximo 900 palabras. No incluyas encabezado de obra ni firmas: el PDF los agrega.`;

export function buildInformeUserMessage(data: ReportData, brief: string): string {
  const lines: string[] = [];
  lines.push(`OBRA: ${data.project.name} (${data.project.registrationCode}) — ${data.project.companyName}`);
  lines.push(`ALCANCE: ${data.scopeLabel}`);
  if (data.from || data.to) lines.push(`PERIODO: ${data.from?.toISOString().slice(0, 10) ?? "inicio"} a ${data.to?.toISOString().slice(0, 10) ?? "hoy"}`);
  lines.push("", "PARTIDAS Y AVANCE:");
  for (const p of data.partidas) lines.push(`- ${p.name}${p.segmentName ? ` (${p.segmentName})` : ""}: ${p.progressPct}%`);
  lines.push("", `REGISTROS DEL PERIODO (${data.registros.length}):`);
  for (const r of data.registros) {
    lines.push(`- [${r.serverCreatedAt.toISOString().slice(0, 16).replace("T", " ")}] ${r.authorName} @ ${r.partidaName}${r.category ? ` [${r.category}]` : ""}: ${r.text ?? "(solo adjuntos)"}${r.attachmentCount ? ` (${r.attachmentCount} adjuntos)` : ""}`);
  }
  lines.push("", `SOLICITUDES DE CAMBIO (${data.cambios.length}):`);
  for (const c of data.cambios) lines.push(`- ${c.code} ${c.title} [${c.status}]${c.resolutionNote ? ` — ${c.resolutionNote}` : ""}`);
  lines.push("", "SOLICITUD DEL USUARIO (enfoque del informe):", brief);
  return lines.join("\n");
}
```

- [ ] **Step 2: Client wrapper** — create `src/lib/informes/client.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

// Locked decision D2: claude-sonnet-4-6. thinking disabled + effort low keeps
// generation inside serverless time budgets (~10-30s at max_tokens 4096);
// quality-vs-speed retuning is a product decision, not a code default to drift.
export const INFORME_MODEL = "claude-sonnet-4-6";

export async function generateInformeContent(system: string, userMessage: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.create({
    model: INFORME_MODEL,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new Error("El generador no devolvio contenido.");
  return text.text;
}
```

(If the SDK's type for `output_config`/`thinking` differs at compile time, check `node_modules/@anthropic-ai/sdk` typings and adapt the call — the parameters are real; do NOT silently drop them. If `output_config` is not yet in the installed SDK's types, cast the params object `as never`-free via a typed spread: `...( { output_config: { effort: "low" } } as object )` — keep the wire shape.)

- [ ] **Step 3: Failing action tests** — create `tests/informes-action.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
const generateMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/informes/client", () => ({
  INFORME_MODEL: "claude-sonnet-4-6",
  generateInformeContent: generateMock,
}));

import { createInforme } from "@/app/actions/informes";

let companyId = "", outCompanyId = "", managerId = "", noFirmaId = "", outsiderId = "", projectId = "";

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Inf Co ${s}`, sealKey: "seal-inf.png" } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `Inf Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr Inf", role: "MANAGER", companyId, passwordHash: "x", signatureKey: "firma-inf.png" } })).id;
  noFirmaId = (await prisma.user.create({ data: { email: `nf-${s}@x.do`, name: "Sin Firma", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Inf Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

describe("createInforme", () => {
  it("persists a generated informe and returns its id", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockResolvedValue("# Resumen Ejecutivo\nTodo bien.");
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "Informe mensual para el cliente" }));
    expect(res).toMatchObject({ ok: true });
    const informe = await prisma.informe.findFirstOrThrow({ where: { projectId } });
    expect(informe.contentMd).toContain("Resumen Ejecutivo");
    expect(informe.model).toBe("claude-sonnet-4-6");
    expect(informe.requestedById).toBe(managerId);
  });
  it("fails with a firma-specific error when the requester has no signature", async () => {
    authMock.mockResolvedValue({ user: { id: noFirmaId, companyId, role: "ADMIN" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x" }));
    expect(res).toMatchObject({ ok: false, missingFirma: true });
  });
  it("requires a brief", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "  " }));
    expect(res).toMatchObject({ ok: false });
    expect((res as { error?: string }).error).toMatch(/describe/i);
  });
  it("cross-tenant project is rejected", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: outCompanyId, role: "MANAGER" } });
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "x" }));
    expect(res).toMatchObject({ ok: false });
  });
  it("surfaces generator failures as a friendly error", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    generateMock.mockRejectedValue(new Error("api down"));
    const res = await createInforme(null, fd({ projectId, scopeType: "project", scopeId: projectId, brief: "y" }));
    expect(res).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 4: Run — fail.** Then implement `src/app/actions/informes.ts`:

```ts
"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assembleReportData, type ReportScope } from "@/lib/report/data";
import { INFORME_SYSTEM, buildInformeUserMessage } from "@/lib/informes/prompt";
import { generateInformeContent, INFORME_MODEL } from "@/lib/informes/client";
import { requireFreshSession } from "@/lib/auth/session";

export type InformeResult =
  | { ok: true; informeId: string }
  | { ok: false; error: string; missingFirma?: boolean };

/**
 * Generate and persist an AI informe. Any project member may request one (the
 * informe records who); the requester must have a firma on file because it is
 * stamped into the PDF footer.
 *
 * NOTE (deploy): generation is a synchronous Claude call (~10-30s at
 * max_tokens 4096). Fine in dev and within Netlify Pro's 26s window; if
 * production timeouts appear, move to a background function.
 */
export async function createInforme(_prev: InformeResult | null, formData: FormData): Promise<InformeResult> {
  try {
    const user = await requireFreshSession();

    const requester = await prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId },
      select: { id: true, name: true, signatureKey: true },
    });
    if (!requester) return { ok: false, error: "No autorizado." };
    if (!requester.signatureKey) {
      return { ok: false, missingFirma: true, error: "Necesitas registrar tu firma en Equipo antes de generar informes." };
    }

    const brief = String(formData.get("brief") ?? "").trim();
    if (!brief) return { ok: false, error: "Describe de que va el informe." };
    if (brief.length > 2000) return { ok: false, error: "La solicitud es demasiado larga (max. 2000 caracteres)." };

    const scopeType = String(formData.get("scopeType"));
    const scopeId = String(formData.get("scopeId"));
    if (!["project", "segment", "partida"].includes(scopeType) || !scopeId) {
      return { ok: false, error: "Alcance invalido." };
    }
    const scope = { type: scopeType, id: scopeId } as ReportScope;

    const parseDate = (k: string): Date | null | "invalid" => {
      const raw = String(formData.get(k) ?? "").trim();
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? "invalid" : d;
    };
    const from = parseDate("from");
    const to = parseDate("to");
    if (from === "invalid" || to === "invalid") return { ok: false, error: "Rango de fechas invalido." };

    // Tenant + archived scoping happens inside assembleReportData.
    const data = await assembleReportData({ id: user.id, companyId: user.companyId, role: user.role }, scope, from, to);
    if (!data) return { ok: false, error: "No autorizado." };

    const contentMd = await generateInformeContent(INFORME_SYSTEM, buildInformeUserMessage(data, brief));

    const informe = await prisma.informe.create({
      data: {
        projectId: data.project.id,
        segmentId: scope.type === "segment" ? scope.id : null,
        partidaId: scope.type === "partida" ? scope.id : null,
        requestedById: requester.id,
        brief,
        periodFrom: from,
        periodTo: to,
        contentMd,
        model: INFORME_MODEL,
      },
    });

    revalidatePath(`/app/projects/${data.project.id}`);
    return { ok: true, informeId: informe.id };
  } catch (e) {
    const message = e instanceof Error && e.message.includes("ANTHROPIC")
      ? "El generador de informes no esta configurado (falta la clave de API)."
      : "No se pudo generar el informe. Intentalo de nuevo.";
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 5: Run — pass; full suite**

```bash
npx vitest run tests/informes-action.test.ts && npm test
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(r2): AI informe engine — fixed-format prompt, sonnet client, createInforme action (R2.2)"
```

---

### Task 6: Informe PDF route (TDD)

**Files:**
- Create: `src/app/api/informes/[id]/pdf/route.ts`
- Test: `tests/informe-pdf-route.test.ts`

- [ ] **Step 1: Failing test** — create `tests/informe-pdf-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { generateRegistrationCode } from "@/lib/project/registration-code";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
// firma/seal bytes come from storage — serve a tiny valid PNG so pdfkit can embed it.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
vi.mock("@/lib/storage", () => ({
  storage: { put: vi.fn(), get: vi.fn(async () => Readable.from([PNG_1PX])) },
}));

import { GET } from "@/app/api/informes/[id]/pdf/route";

let companyId = "", outCompanyId = "", managerId = "", outsiderId = "", projectId = "", informeId = "";

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `IP Co ${s}`, sealKey: "seal-ip.png" } })).id;
  outCompanyId = (await prisma.company.create({ data: { name: `IP Out ${s}` } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr IP", role: "MANAGER", companyId, passwordHash: "x", signatureKey: "firma-ip.png" } })).id;
  outsiderId = (await prisma.user.create({ data: { email: `out-${s}@x.do`, name: "Out", role: "MANAGER", companyId: outCompanyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `IP Obra ${s}`, registrationCode: generateRegistrationCode() } })).id;
  informeId = (await prisma.informe.create({
    data: {
      projectId, requestedById: managerId, brief: "Mensual",
      contentMd: "# Resumen Ejecutivo\nAvance constante.\n# Recomendaciones\n- Continuar",
      model: "claude-sonnet-4-6",
    },
  })).id;
});

afterAll(async () => {
  await prisma.informe.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId: { in: [companyId, outCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, outCompanyId] } } });
});

function call(id: string) {
  return GET(new Request("http://test/x"), { params: Promise.resolve({ id }) });
}

describe("informe PDF route", () => {
  it("company member downloads the informe as PDF (firma + seal embedded)", async () => {
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    const res = await call(informeId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("cross-tenant access is 404", async () => {
    authMock.mockResolvedValue({ user: { id: outsiderId, companyId: outCompanyId, role: "MANAGER" } });
    expect((await call(informeId)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — fail.** Then create `src/app/api/informes/[id]/pdf/route.ts`:

```ts
// Renders a persisted AI informe as PDF: code+QR header, fixed-format body,
// requester firma + company seal in the footer (spec R2.2).
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";
import { buildReportPdf } from "@/lib/report/pdf";
import { storage } from "@/lib/storage";
import { requireFreshSession } from "@/lib/auth/session";

async function keyToBuffer(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    const stream = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
    return Buffer.concat(chunks);
  } catch {
    return null; // missing image never blocks the report
  }
}

function sanitizeFilename(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-").slice(0, 80);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const user = await requireFreshSession();
    const sessionUser = { id: user.id, companyId: user.companyId, role: user.role };

    const informe = await prisma.informe.findFirst({
      where: { id, project: projectAccessWhere(sessionUser) },
      include: { project: { select: { id: true, name: true, registrationCode: true, company: { select: { name: true, sealKey: true } } } } },
    });
    if (!informe) return new Response("Not found", { status: 404 });

    const requester = await prisma.user.findFirst({
      where: { id: informe.requestedById, companyId: user.companyId },
      select: { name: true, signatureKey: true },
    });

    const scopeLabel = informe.partidaId ? "Informe de partida" : informe.segmentId ? "Informe de bloque" : "Informe de obra";
    const [firmaPng, sealPng] = await Promise.all([
      keyToBuffer(requester?.signatureKey ?? null),
      keyToBuffer(informe.project.company.sealKey),
    ]);

    const pdf = await buildReportPdf({
      data: {
        project: {
          id: informe.project.id,
          name: informe.project.name,
          registrationCode: informe.project.registrationCode,
          companyName: informe.project.company.name,
        },
        scopeLabel,
        from: informe.periodFrom,
        to: informe.periodTo,
        partidas: [],
        registros: [],
        cambios: [],
      },
      generatedBy: requester?.name ?? "—",
      informe: {
        contentMd: informe.contentMd,
        requesterName: requester?.name ?? "—",
        firmaPng,
        sealPng,
      },
    });

    const filename = `${sanitizeFilename(informe.project.name)}-informe-${informe.createdAt.toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    if (e instanceof Error && e.message === "Forbidden") return new Response("Forbidden", { status: 403 });
    return new Response("Error", { status: 500 });
  }
}
```

(If `sanitizeFilename` was extracted to `@/lib/report/params` in Task 4, import it instead of redefining.)

- [ ] **Step 3: Run — pass; full suite + build; commit**

```bash
npx vitest run tests/informe-pdf-route.test.ts && npm test && npm run build
git add -A && git commit -m "feat(r2): informe PDF route — code+QR header, firma + seal footer (R2.2)"
```

---

### Task 7: Informes tab UI

**Files:**
- Modify: `src/i18n/dictionaries.ts` (project block + new `informes` block, both locales)
- Create: `src/components/informes-tab.tsx`
- Modify: `src/app/app/projects/[id]/page.tsx` (activeTab, tab nav line ~288, tab body, data queries)
- Modify: `src/components/icons.tsx` (add `FileText` icon)

- [ ] **Step 1: Dictionary.** ES `project` block adds `tabInformes: "Informes",` (after `tabAnalytics`). EN: `tabInformes: "Reports",`. New top-level `informes` block, ES (after `verify`):

```ts
    informes: {
      title: "Generador de informes",
      hint: "Describe el informe que necesitas; la IA lo redacta solo con lo registrado en la obra.",
      brief: "De que va el informe",
      briefPlaceholder: "Informe mensual de avance para el cliente, enfocado en el Bloque A…",
      scope: "Alcance",
      scopeProject: "Obra completa",
      scopeSegment: "Bloque",
      scopePartida: "Partida",
      from: "Desde (opcional)",
      to: "Hasta (opcional)",
      generate: "Generar informe",
      generating: "Generando… (puede tardar medio minuto)",
      missingFirma: "Registra tu firma en Equipo para poder firmar informes.",
      goToEquipo: "Ir a Equipo",
      empty: "Aún no hay informes generados.",
      requestedBy: "solicitado por",
      downloadPdf: "Descargar PDF",
      reportSection: "Reportes del periodo",
      reportHint: "Reporte completo y verificable de lo registrado (sin IA).",
      downloadReport: "Descargar reporte de obra",
    },
```

EN:

```ts
    informes: {
      title: "Report generator",
      hint: "Describe the report you need; the AI writes it using only what is logged on the site.",
      brief: "What the report is about",
      briefPlaceholder: "Monthly progress report for the client, focused on Block A…",
      scope: "Scope",
      scopeProject: "Whole site",
      scopeSegment: "Block",
      scopePartida: "Work item",
      from: "From (optional)",
      to: "To (optional)",
      generate: "Generate report",
      generating: "Generating… (may take half a minute)",
      missingFirma: "Add your signature in Team to be able to sign reports.",
      goToEquipo: "Go to Team",
      empty: "No generated reports yet.",
      requestedBy: "requested by",
      downloadPdf: "Download PDF",
      reportSection: "Period reports",
      reportHint: "Complete, verifiable report of what was logged (no AI).",
      downloadReport: "Download site report",
    },
```

- [ ] **Step 2: Icon.** Append to `src/components/icons.tsx` (matches `base()` pattern):

```tsx
export function FileText({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <polyline points="14 2 14 7 19 7" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}
```

- [ ] **Step 3: Tab component** — create `src/components/informes-tab.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { createInforme, type InformeResult } from "@/app/actions/informes";
import { SubmitButton } from "@/components/submit-button";
import { FileText } from "@/components/icons";

type InformeRow = { id: string; brief: string; createdAt: string; requesterName: string; scopeLabel: string };
type Option = { id: string; name: string };

type T = {
  title: string; hint: string; brief: string; briefPlaceholder: string;
  scope: string; scopeProject: string; scopeSegment: string; scopePartida: string;
  from: string; to: string; generate: string; generating: string;
  missingFirma: string; goToEquipo: string; empty: string; requestedBy: string; downloadPdf: string;
  reportSection: string; reportHint: string; downloadReport: string;
};

export function InformesTab({ projectId, segments, partidas, informes, t }: {
  projectId: string;
  segments: Option[];
  partidas: Option[];
  informes: InformeRow[];
  t: T;
}) {
  const [state, formAction, pending] = useActionState<InformeResult | null, FormData>(createInforme, null);

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 20 }}>
      {/* Deterministic period report (no AI) */}
      <div className="card" style={{ padding: 16 }}>
        <div className="form-label" style={{ marginBottom: 4 }}>{t.reportSection}</div>
        <p className="mono text-steel" style={{ fontSize: "0.72rem", margin: "0 0 10px" }}>{t.reportHint}</p>
        <a href={`/api/projects/${projectId}/report`} className="btn btn-ghost" style={{ fontSize: "0.8rem", textDecoration: "none" }}>
          <FileText size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.downloadReport}
        </a>
      </div>

      {/* AI generator */}
      <form action={formAction} className="card" style={{ padding: 16 }}>
        <div className="form-label" style={{ marginBottom: 4 }}>{t.title}</div>
        <p className="mono text-steel" style={{ fontSize: "0.72rem", margin: "0 0 10px" }}>{t.hint}</p>
        <input type="hidden" name="projectId" value={projectId} />
        <label className="form-label" style={{ display: "block", marginBottom: 10 }}>
          {t.brief}
          <textarea name="brief" required maxLength={2000} rows={3} placeholder={t.briefPlaceholder} className="input" style={{ display: "block", width: "100%", marginTop: 4, resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
          <label className="form-label">
            {t.scope}
            <select name="scopeRef" defaultValue={`project:${projectId}`} className="input" style={{ display: "block", marginTop: 4 }}>
              <option value={`project:${projectId}`}>{t.scopeProject}</option>
              {segments.map((s) => <option key={s.id} value={`segment:${s.id}`}>{t.scopeSegment}: {s.name}</option>)}
              {partidas.map((p) => <option key={p.id} value={`partida:${p.id}`}>{t.scopePartida}: {p.name}</option>)}
            </select>
          </label>
          <label className="form-label">
            {t.from}
            <input type="date" name="from" className="input" style={{ display: "block", marginTop: 4 }} />
          </label>
          <label className="form-label">
            {t.to}
            <input type="date" name="to" className="input" style={{ display: "block", marginTop: 4 }} />
          </label>
          <SubmitButton className="btn btn-accent">{pending ? t.generating : t.generate}</SubmitButton>
        </div>
        {state && !state.ok && (
          <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem" }}>
            {state.missingFirma ? (
              <>{t.missingFirma} <Link href="/app/admin" style={{ color: "var(--accent-deep)" }}>{t.goToEquipo}</Link></>
            ) : state.error}
          </p>
        )}
      </form>

      {/* History */}
      <div className="repo-list">
        {informes.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {informes.map((i) => (
          <div key={i.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title">{i.brief.length > 90 ? `${i.brief.slice(0, 90)}…` : i.brief}</span>
              <span className="cr-meta">{i.scopeLabel} · {i.requestedBy ?? ""}{t.requestedBy} {i.requesterName} · {i.createdAt}</span>
            </span>
            <a href={`/api/informes/${i.id}/pdf`} className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", whiteSpace: "nowrap" }}>
              {t.downloadPdf}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

IMPLEMENTATION NOTE: the form posts `scopeRef` as `"type:id"` but the action expects `scopeType`/`scopeId`. Reconcile by splitting in the action: in `src/app/actions/informes.ts`, BEFORE reading scopeType/scopeId, accept the combined field:

```ts
    const scopeRef = String(formData.get("scopeRef") ?? "");
    const [scopeType, scopeId] = scopeRef ? scopeRef.split(":", 2) : [String(formData.get("scopeType")), String(formData.get("scopeId"))];
```

(keep the existing validation; cuid IDs contain no ":" so the split is safe — Task 5's tests keep passing because the fallback path still reads scopeType/scopeId). Also fix the history row template: `{i.scopeLabel} · {t.requestedBy} {i.requesterName} · {i.createdAt}` (drop the stray `i.requestedBy ?? ""`).

- [ ] **Step 4: Wire the tab.** In `src/app/app/projects/[id]/page.tsx`:

(a) `activeTab` line: add `"informes"`:

```ts
  const activeTab = tab === "cambios" ? "cambios" : tab === "planos" ? "planos" : tab === "analitica" ? "analitica" : tab === "informes" ? "informes" : "code";
```

(b) Tab nav (after the Analítica Link, line ~288):

```tsx
        <Link href={`/app/projects/${id}?tab=informes`} className={`tab ${activeTab === "informes" ? "is-on" : ""}`} aria-current={activeTab === "informes" ? "page" : undefined}><FileText size={13} />{P.tabInformes}</Link>
```

(add `FileText` to the icons import.)

(c) Data for the tab (near the other tab-scoped queries):

```ts
  const informeRows = activeTab === "informes"
    ? await prisma.informe.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, brief: true, createdAt: true, requestedById: true, segmentId: true, partidaId: true },
      })
    : [];
  const informeRequesterIds = [...new Set(informeRows.map((i) => i.requestedById))];
  const informeRequesters = informeRequesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: informeRequesterIds }, companyId }, select: { id: true, name: true } })
    : [];
  const informeRequesterMap = new Map(informeRequesters.map((u) => [u.id, u.name]));
```

(d) Tab body (new branch in the activeTab render chain, mirroring the planos branch):

```tsx
      ) : activeTab === "informes" ? (
        <InformesTab
          projectId={project.id}
          segments={segmentOptions}
          partidas={allPartidas.map((p) => ({ id: p.id, name: p.name }))}
          informes={informeRows.map((i) => ({
            id: i.id,
            brief: i.brief,
            createdAt: formatTimestamp(i.createdAt, lang),
            requesterName: informeRequesterMap.get(i.requestedById) ?? "—",
            scopeLabel: i.partidaId ? t.informes.scopePartida : i.segmentId ? t.informes.scopeSegment : t.informes.scopeProject,
          }))}
          t={t.informes}
        />
```

(import `InformesTab`; `formatTimestamp` and `segmentOptions`/`allPartidas` already exist in the file — verify names before using.)

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run lint && npm run build
git add -A && git commit -m "feat(r2): Informes tab — AI generator form, history with PDF download, period report link (R2.2)"
```

---

### Task 8: Env docs + final gate + push

**Files:**
- Modify: `.env.example`, `README.md` (env table)

- [ ] **Step 1:** `.env.example` — add after the Resend block:

```bash
# ─── AI report generation (Informes) ────────────────────────────────────────
# Server-side only. Generation uses claude-sonnet-4-6 (~US$0.06-0.36 per informe).
ANTHROPIC_API_KEY="sk-ant-..."
```

README env table — add row: `| ANTHROPIC_API_KEY | for informes | AI report generation (Claude API) |`

- [ ] **Step 2: Full gate**

```bash
npm test && npm run lint && npm run build
```

Expected: ~270 tests green, lint clean, build lists `/api/projects/[id]/report`, `/api/segments/[id]/report`, `/api/informes/[id]/pdf`.

- [ ] **Step 3: Acceptance sweep** (manual, `npm run dev`, requires ANTHROPIC_API_KEY in `.env.local` for the live path):
- Informes tab visible; deterministic "Descargar reporte de obra" downloads a PDF with code + QR header.
- `?from/to` on a partida report URL filters registros.
- Generate an informe (user WITH firma): ~15-30s, lands in history, PDF shows the 5 fixed sections + firma + seal in footer.
- User WITHOUT firma: friendly error linking to Equipo.
- Cross-checks: outsider URLs 404.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-review (done at planning time)

- **Spec coverage:** R2.1 → T2 (data) + T3 (builder) + T4 (routes incl. partida from/to + code/QR header) · R2.2 → T1 (model+dep) + T5 (prompt/client/action incl. firma gate + persistence + sonnet model string) + T6 (PDF with firma/seal footer) + T7 (Informes tab + missing-firma UX) + T8 (ANTHROPIC_API_KEY docs). Spec note "read claude-api skill before integration" — honored at planning time: client uses `claude-sonnet-4-6`, `thinking: disabled`, `output_config.effort: low`, `max_tokens: 4096`, env-key constructor, content-block narrowing by `.type`.
- **Type consistency:** `ReportScope`/`ReportData`/`assembleReportData` (T2) consumed by T4/T5/T6; `buildReportPdf({ data, generatedBy, informe? })` (T3) consumed by T4 routes + T6; `InformeResult` (T5) consumed by T7's `useActionState`; `scopeRef` reconciliation noted in T7 with the exact action patch.
- **Known judgment calls:** partida route extended in place (audited legal layout preserved) rather than rebuilt on the shared builder; `Informe` model name instead of spec's generic "Report" (collision with deterministic report routes); chain-integrity line suppressed on ranged partida reports (partial chain would mislead); Netlify 26s ceiling documented, not solved.
- **Ripple watch:** `tests/report-route.test.ts` may need assertion updates after the header gains the code line (T4 Step 4 handles).
