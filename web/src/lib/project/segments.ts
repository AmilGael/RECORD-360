import { prisma } from "@/lib/db";
import { retryOnConflict } from "@/lib/registro/retry";

export type ResolvedSegment = { id: string | null; created: boolean };

/**
 * Resolve a segment label to an id, scoped to a project. null label → null id.
 *
 * Matches an existing segment case-insensitively (so "cimentación" reuses
 * "Cimentación") and reuses it; otherwise creates one. NOTE: the DB
 * @@unique([projectId, name]) is case-SENSITIVE (Postgres default collation),
 * so this app-level case-insensitive match is what dedups case variants.
 *
 * find-then-create is not atomic: two concurrent creates of the same name race
 * to a P2002 unique violation. retryOnConflict re-runs the closure, which then
 * finds the just-created row and returns its id (graceful reuse, no 500).
 *
 * `created` reports whether THIS call inserted the row — derived from the
 * create path itself, never from a separate pre-check, so under a concurrent
 * race exactly one caller sees created: true (the loser's retry lands on the
 * findFirst branch). Callers use it to emit block.created exactly once.
 * Callers pass the output of parseSegment.
 */
export async function resolveSegment(projectId: string, label: string | null): Promise<ResolvedSegment> {
  if (!label) return { id: null, created: false };
  return retryOnConflict(async () => {
    const existing = await prisma.segment.findFirst({
      where: { projectId, name: { equals: label, mode: "insensitive" } },
    });
    if (existing) return { id: existing.id, created: false };
    const created = await prisma.segment.create({ data: { projectId, name: label } });
    return { id: created.id, created: true };
  });
}
