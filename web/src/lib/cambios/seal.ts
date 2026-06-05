// Server-only module: uses node:crypto and must never be imported into a
// client component. Canonical SHA-256 over the frozen change-order content.
// Field order is fixed and partidaIds are sorted so the seal is stable
// regardless of input order.
import { createHash } from "node:crypto";

export type ChangeSealInput = {
  code: string;
  title: string;
  description: string | null;
  costImpact: string | null;
  daysImpact: number | null;
  partidaIds: string[];
  authorId: string;
  resolvedById: string;
  resolvedAt: Date;
};

export function computeChangeSeal(input: ChangeSealInput): string {
  const canonical = JSON.stringify({
    code: input.code,
    title: input.title,
    description: input.description,
    costImpact: input.costImpact,
    daysImpact: input.daysImpact,
    partidaIds: [...input.partidaIds].sort(),
    authorId: input.authorId,
    resolvedById: input.resolvedById,
    resolvedAt: input.resolvedAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
