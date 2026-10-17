/**
 * Provision or update a user directly in the database.
 *
 *   ADMIN_EMAIL     required  e.g. acv20207@gmail.com (stored lowercased)
 *   ADMIN_ROLE      optional  one of SUPERADMIN|ADMIN|MANAGER|SUPERVISOR|RESIDENT (default ADMIN)
 *   ADMIN_NAME      required on create; optional on update
 *   ADMIN_COMPANY   required on create; ignored on update
 *   ADMIN_PASSWORD  required on create; optional on update (omit to keep current password)
 *
 * Run against whatever DATABASE_URL is in the environment:
 *   ADMIN_EMAIL=... ADMIN_ROLE=SUPERADMIN npx tsx scripts/create-admin.ts   # promote existing user
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "../src/lib/auth/email";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return value;
}

async function main() {
  const email = normalizeEmail(required("ADMIN_EMAIL"));
  const roleRaw = process.env.ADMIN_ROLE?.trim() || "ADMIN";
  if (!Object.values(Role).includes(roleRaw as Role)) {
    console.error(`Invalid ADMIN_ROLE: ${roleRaw}. Use one of ${Object.values(Role).join(", ")}.`);
    process.exit(1);
  }
  const role = roleRaw as Role;
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (password && password.length < 8) { console.error("ADMIN_PASSWORD must be at least 8 characters."); process.exit(1); }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const data: { role: Role; disabledAt: null; name?: string; passwordHash?: string } = { role, disabledAt: null };
    if (process.env.ADMIN_NAME?.trim()) data.name = process.env.ADMIN_NAME.trim();
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { email }, data });
    console.log(`Done. Updated ${user.email} → role ${user.role}.`);
    return;
  }

  // Create path: name + company + password all required.
  const name = required("ADMIN_NAME");
  const companyName = required("ADMIN_COMPANY");
  if (!password) { console.error("ADMIN_PASSWORD is required to create a new user."); process.exit(1); }
  const passwordHash = await bcrypt.hash(password, 10);
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));
  const user = await prisma.user.create({ data: { email, name, role, companyId: company.id, passwordHash, emailVerifiedAt: new Date() } });
  console.log(`Done. Created ${user.email} (role ${user.role}) in company "${company.name}".`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
