import type { Prisma } from "@prisma/client";

export type AuditInput = {
  companyId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.auditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata ?? undefined,
    },
  });
}
