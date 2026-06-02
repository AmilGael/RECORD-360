import { prisma } from "@/lib/db";

/**
 * Resolve a segment label to an id, scoped to a project. null → null. Matches an
 * existing segment case-insensitively (so "cimentación" reuses "Cimentación")
 * and reuses it; otherwise creates a new segment with the given (already trimmed)
 * label. Callers pass the output of parseSegment.
 */
export async function resolveSegment(projectId: string, label: string | null): Promise<string | null> {
  if (!label) return null;
  const existing = await prisma.segment.findFirst({
    where: { projectId, name: { equals: label, mode: "insensitive" } },
  });
  if (existing) return existing.id;
  const created = await prisma.segment.create({ data: { projectId, name: label } });
  return created.id;
}
