import { Role } from "@prisma/client";
import { requireFreshSession, type FreshSessionUser } from "@/lib/auth/session";

/** Require a signed-in platform operator (SUPERADMIN). Re-reads role from the DB (fresh). */
export async function requireSuperAdmin(): Promise<FreshSessionUser> {
  const user = await requireFreshSession();
  if (user.role !== Role.SUPERADMIN) throw new Error("Forbidden");
  return user;
}
