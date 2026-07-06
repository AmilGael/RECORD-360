/**
 * Provision (or update) an ADMIN user directly in the database.
 *
 * Every user is tenant-scoped, so this also ensures a Company exists and attaches
 * the admin to it. Idempotent: re-running with the same email updates the name /
 * password and re-enables the account rather than creating a duplicate.
 *
 * Inputs are read from env vars (not argv) so the password never lands in shell
 * history or the process list:
 *
 *   ADMIN_EMAIL     required  e.g. acv20207@gmail.com  (stored lowercased)
 *   ADMIN_NAME      required  display name, e.g. "Andrés C."
 *   ADMIN_COMPANY   required  company/tenant name; reused if one already matches
 *   ADMIN_PASSWORD  required  min 8 chars; bcrypt-hashed before storage
 *
 * Runs against whatever DATABASE_URL is in the environment. To target production,
 * export the prod DATABASE_URL first (e.g. from the Netlify env), then:
 *
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_COMPANY=... ADMIN_PASSWORD=... \
 *     npx tsx scripts/create-admin.ts
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const email = required("ADMIN_EMAIL").toLowerCase();
  const name = required("ADMIN_NAME");
  const companyName = required("ADMIN_COMPANY");
  const password = required("ADMIN_PASSWORD");

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Reuse a company with this exact name if one exists, else create it.
  const company =
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({ data: { name: companyName } }));

  // On update we deliberately do NOT move an existing user to a different company
  // (that would change their tenant); we only refresh name/password and re-enable.
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: Role.ADMIN, passwordHash, disabledAt: null },
    create: { email, name, role: Role.ADMIN, companyId: company.id, passwordHash },
  });

  console.log(
    `Done. Admin ready: ${user.email} (role ${user.role}) in company "${company.name}" [${company.id}].`,
  );
  console.log("Log in at /login with that email and the password you provided.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
