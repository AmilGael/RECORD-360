import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

export type FreshSessionUser = {
  id: string;
  companyId: string;
  role: Role;
  name: string;
  email: string;
};

export async function requireFreshSession(): Promise<FreshSessionUser> {
  const session = await auth();
  const tokenUser = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!tokenUser?.id || !tokenUser.companyId || !tokenUser.role) throw new Error("Unauthorized");

  const current = await prisma.user.findUnique({
    where: { id: tokenUser.id },
    select: { id: true, companyId: true, role: true, disabledAt: true, name: true, email: true },
  });
  if (!current) throw new Error("Unauthorized");
  if (current.disabledAt) throw new Error("Forbidden");
  if (current.companyId !== tokenUser.companyId || current.role !== tokenUser.role) throw new Error("Forbidden");
  return current;
}
