import { prisma } from "@/lib/db";
import { retryOnConflict } from "@/lib/registro/retry";

/**
 * Resolve a segment label to an id, scoped to a project. null → null.
 *
 * Matches an existing segment case-insensitively (so "cimentación" reuses
 * "Cimentación") and reuses it; otherwise creates one. NOTE: the DB
 * @@unique([projectId, name]) is case-SENSITIVE (Postgres default collation),
 * so this app-level case-insensitive match is what dedups case variants.
 *
 * find-then-create is not atomic: two concurrent creates of the same name race
 * to a P2002 unique violation. retryOnConflict re-runs the closure, which then
 * finds the just-created row and returns its id (graceful reuse, no 500).
 * Callers pass the output of parseSegment.
 */
export async function resolveSegment(projectId: string, label: string | null): Promise<string | null> {
  if (!label) return null;
  return retryOnConflict(async () => {
    const existing = await prisma.segment.findFirst({
      where: { projectId, name: { equals: label, mode: "insensitive" } },
    });
    if (existing) return existing.id;
    const created = await prisma.segment.create({ data: { projectId, name: label } });
    return created.id;
  });
}
