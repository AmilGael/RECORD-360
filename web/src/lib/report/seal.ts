// Shared, tenant-scoped company-seal loader for every PDF export route
// (R3 WS11). Always keyed off the CALLER's own companyId — never trusts an
// id coming from the target resource without that resource already having
// been access-checked against the same tenant.
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

/**
 * Load the company's visual seal image (Company.sealKey) as a Buffer, scoped
 * to `companyId`. Returns null when the company has no seal on file or the
 * stored object cannot be read. Export routes treat null as a hard precondition
 * failure so an unsealed PDF can never be emitted.
 */
export async function loadCompanySealPng(companyId: string): Promise<Buffer | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { sealKey: true } });
  if (!company?.sealKey) return null;
  try {
    const stream = await storage.get(company.sealKey);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
