// Single shared source for informe archetype values + their Spanish labels
// (R3 WS7). The PDF header ("Audiencia: …") and the AI prompt both use the
// Spanish label — Spanish is the informe/PDF content language regardless of
// the viewer's UI locale. UI-facing labels stay in i18n/dictionaries.ts
// (archetypes.*) because those DO localize with the viewer.
import { InformeArchetype } from "@prisma/client";

export const ARCHETYPE_VALUES: InformeArchetype[] = [
  InformeArchetype.OWNER,
  InformeArchetype.SENIOR_MANAGEMENT,
  InformeArchetype.PERSONAL_FEEDBACK,
];

export const ARCHETYPE_LABEL_ES: Record<InformeArchetype, string> = {
  OWNER: "Propietario",
  SENIOR_MANAGEMENT: "Alta gerencia",
  PERSONAL_FEEDBACK: "Retroalimentacion personal",
};
