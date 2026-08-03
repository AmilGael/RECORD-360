// One-shot dev-DB hygiene: delete companies left behind by vitest runs whose
// afterAll cleanup never ran (crashed/failed runs). Run without args for a
// dry-run report; with --execute to delete.
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

// Every vitest fixture name carries a `${Date.now()}-${hex}` suffix, the token
// tests use `tok-co-<letter>-<epoch ms>`, and one test suffixes with a cuid.
// Anything else — real tenants, manual E2E fixtures — does not match and
// survives by construction.
const ORPHAN_PATTERNS = [
  /\s\d{13}-[0-9a-f]{6,}$/, //  "<Prefix> 1785426131298-5279b1fdb6ecf"
  /^tok-co-[a-z]-\d{13}$/, //   "tok-co-v-1785616530005"
  /^Outsider Co c[a-z0-9]{20,}$/, // cuid-suffixed (inline-created, cleanup skipped on assert failure)
];
// Belt over braces: never touch these even if a pattern ever matched them.
const PROTECTED_IDS = new Set([
  "cmpu5hdgn00008o38pqi8h7mh", // Constructora Demo SRL (real demo tenant)
  "cmrcq8zi000008ogmsvcq4vpu", // Operador (platform operator tenant)
]);
// Don't race a live test run: vitest tenants live for seconds; anything this
// old with a fixture name is guaranteed abandoned.
const MIN_AGE_MS = 60 * 60 * 1000;

const all = await prisma.company.findMany({ select: { id: true, name: true, createdAt: true } });
const cutoff = new Date(Date.now() - MIN_AGE_MS);
const orphans = all.filter(
  (c) => !PROTECTED_IDS.has(c.id) && c.createdAt < cutoff && ORPHAN_PATTERNS.some((p) => p.test(c.name)),
);
const survivors = all.filter((c) => !orphans.includes(c));
const ids = orphans.map((c) => c.id);
const inCompany = { companyId: { in: ids } };
const viaProject = { project: { companyId: { in: ids } } };

const counts = {
  registros: await prisma.registro.count({ where: { partida: viaProject } }),
  changeRequests: await prisma.changeRequest.count({ where: viaProject }),
  partidas: await prisma.partida.count({ where: viaProject }),
  segments: await prisma.segment.count({ where: viaProject }),
  locations: await prisma.location.count({ where: viaProject }),
  documents: await prisma.document.count({ where: viaProject }),
  informes: await prisma.informe.count({ where: viaProject }),
  projects: await prisma.project.count({ where: inCompany }),
  notifications: await prisma.notification.count({ where: inCompany }),
  users: await prisma.user.count({ where: inCompany }),
  companies: ids.length,
};

const groups = {};
for (const c of orphans) {
  const key = c.name.replace(/\s?\d{13}.*$|\sc[a-z0-9]{20,}$/, "").trim() || "(tok-co)";
  groups[key] = (groups[key] ?? 0) + 1;
}
console.log("ORPHAN GROUPS:", JSON.stringify(groups));
console.log("ROWS TO DELETE:", JSON.stringify(counts));
console.log("SURVIVORS:", JSON.stringify(survivors.map((c) => c.name)));

if (!EXECUTE) {
  console.log("DRY RUN — re-run with --execute to delete.");
} else if (ids.length === 0) {
  console.log("Nothing to delete.");
} else {
  // Bottom-up FK order. Cascades cover: Attachment (from Registro), Signature +
  // PartidaTagOnPartida (from Partida), ChangeRequest junctions/attachments
  // (from ChangeRequest), ProjectAssignment + PartidaTag (from Project),
  // VerificationToken (from User), AuditLog (from Company). Everything else is
  // Restrict/none and is deleted explicitly, as one atomic batch.
  const r = await prisma.$transaction([
    prisma.registro.deleteMany({ where: { partida: viaProject } }),
    prisma.changeRequest.deleteMany({ where: viaProject }),
    prisma.partida.deleteMany({ where: viaProject }),
    prisma.segment.deleteMany({ where: viaProject }),
    prisma.location.deleteMany({ where: viaProject }),
    prisma.document.deleteMany({ where: viaProject }),
    prisma.informe.deleteMany({ where: viaProject }),
    prisma.project.deleteMany({ where: inCompany }),
    prisma.notification.deleteMany({ where: inCompany }),
    prisma.user.deleteMany({ where: inCompany }),
    prisma.company.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log("DELETED:", JSON.stringify(r.map((x) => x.count)));
  console.log("COMPANIES REMAINING:", await prisma.company.count());
}
await prisma.$disconnect();
