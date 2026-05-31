"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

async function requireCompany() {
  const session = await auth();
  const companyId = (session?.user as { companyId?: string })?.companyId;
  if (!companyId) throw new Error("Unauthorized");
  return companyId;
}

export async function createProject(formData: FormData) {
  const companyId = await requireCompany();
  await prisma.project.create({ data: { companyId, name: String(formData.get("name")), description: String(formData.get("description") ?? "") || null } });
  revalidatePath("/");
}

export async function createPartida(formData: FormData) {
  await requireCompany();
  await prisma.partida.create({ data: { projectId: String(formData.get("projectId")), name: String(formData.get("name")) } });
  revalidatePath(`/projects/${formData.get("projectId")}`);
}

export async function createUser(formData: FormData) {
  const companyId = await requireCompany();
  const tempPassword = Math.random().toString(36).slice(-10);
  await prisma.user.create({
    data: {
      email: String(formData.get("email")), name: String(formData.get("name")),
      role: String(formData.get("role")) as Role, companyId,
      passwordHash: await bcrypt.hash(tempPassword, 10),
    },
  });
  revalidatePath("/admin");
  return tempPassword;
}
