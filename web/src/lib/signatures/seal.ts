// Server-only module: uses node:crypto. Never import into a client component.
// Canonical SHA-256 over the frozen signature payload — mirrors computeChangeSeal
// in src/lib/cambios/seal.ts.
import { createHash } from "node:crypto";

export interface SignatureSealInput {
  partidaId: string;
  signerId: string;
  signerName: string;
  signerRole: string;
  statement: string | null;
  chainHead: string;
  signedAt: Date;
}

export function computeSignatureSeal(input: SignatureSealInput): string {
  // Canonical, order-stable JSON (excludes id + seal). signedAt as ISO string.
  const canonical = JSON.stringify({
    partidaId: input.partidaId,
    signerId: input.signerId,
    signerName: input.signerName,
    signerRole: input.signerRole,
    statement: input.statement ?? null,
    chainHead: input.chainHead,
    signedAt: input.signedAt.toISOString(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
