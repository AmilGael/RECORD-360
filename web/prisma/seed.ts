import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@record360.do" } });
  if (existing) {
    console.log("Admin already seeded — skipping.");
    return;
  }
  const company = await prisma.company.create({ data: { name: "Constructora Demo SRL" } });
  await prisma.user.create({
    data: {
      email: "admin@record360.do",
      name: "Admin Demo",
      role: "ADMIN",
      companyId: company.id,
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });
  console.log("Seeded admin@record360.do / demo1234");
}

main().finally(() => prisma.$disconnect());
