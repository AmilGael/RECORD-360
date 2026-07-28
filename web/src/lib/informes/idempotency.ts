import { createHash } from "node:crypto";
import type { InformeArchetype } from "@prisma/client";

/**
 * Deterministic fingerprint of an informe request (M2).
 *
 * Two submissions of the same form by the same person produce the same key, so
 * the unique index on Informe.idempotencyKey collapses them into one row and
 * one paid generation. Computed server-side from validated values only — the
 * client never supplies it and so cannot forge a collision (stealing another
 * user's informe) or a miss (forcing a duplicate charge).
 *
 * requesterId is part of the key on purpose: two people legitimately asking for
 * the same report each get their own, because each is stamped with its own
 * requester and firma in the PDF.
 *
 * Deliberately NOT time-bucketed: an identical request is treated as the same
 * request forever. Regenerating a different informe only requires changing the
 * brief, the scope, the archetype or the period — any of which changes the key.
 */
const SEP = "\u0000";

export function buildInformeIdempotencyKey(input: {
  requesterId: string;
  projectId: string;
  scopeType: string;
  scopeId: string;
  archetype: InformeArchetype;
  brief: string;
  from: Date | null;
  to: Date | null;
}): string {
  // NUL separator: it cannot occur in a cuid, an enum value, an ISO date or a
  // Postgres text field, so no two distinct inputs can join to the same string.
  // A space would be ambiguous - the brief is free text and may contain them.
  // `brief` goes last so its content cannot bleed into a following field.
  const parts = [
    input.requesterId,
    input.projectId,
    input.scopeType,
    input.scopeId,
    input.archetype,
    input.from ? input.from.toISOString() : "",
    input.to ? input.to.toISOString() : "",
    input.brief,
  ];
  return createHash("sha256").update(parts.join(SEP)).digest("hex");
}
