import type { ReportData } from "@/lib/report/data";
import type { InformeArchetype } from "@prisma/client";
import { ARCHETYPE_LABEL_ES } from "./archetypes";
import { formatPeriodDate } from "@/lib/format/period";
import { APP_TIME_ZONE, DEFAULT_APP_TIME_ZONE, zonedTimestamp } from "@/lib/time/zone";

/**
 * Fixed report format (spec R2.2, extended R3 WS7): every informe shares the
 * same non-negotiable ground rules — Spanish, markdown only, no invention,
 * length cap, no header/firma (the PDF adds those). What varies BY AUDIENCE
 * ARCHETYPE is the section structure and what to emphasize (buildInformeSystem
 * below); this base is common to all three.
 */
const BASE_RULES = `Eres el redactor tecnico de Raphel, la bitacora digital inalterable de obras de construccion en la Republica Dominicana.
Redactas informes en espanol, sobrios y precisos, SOLO con los datos proporcionados — nunca inventes hechos, cifras ni fechas.
Markdown simple, sin tablas ni enlaces ni emojis. Si una seccion no tiene datos, escribe "Sin novedades en el periodo."
NUNCA te niegues a redactar por falta de datos, ni pidas mas informacion: entrega SIEMPRE el informe completo con todas las secciones del formato, aunque la obra no tenga ningun registro en el alcance o periodo pedido. En ese caso indica explicitamente que no hay actividad registrada y senala esa ausencia como un hallazgo. Un informe parcial, hecho solo con lo que hay, siempre es preferible a ninguno.
Maximo 900 palabras. No incluyas encabezado de obra ni firmas: el PDF los agrega.`;

/** Section structure + emphasis, each materially different per audience (WS7). */
const ARCHETYPE_SPEC: Record<InformeArchetype, { sections: string; emphasis: string }> = {
  OWNER: {
    sections: `# Resumen Ejecutivo
# Hitos y Avance
# Riesgos Materiales
# Decisiones Requeridas
# Cronograma y Costos`,
    emphasis: `Enfoque OWNER: escribe para el propietario/cliente. Prioriza el estado ejecutivo de la obra, hitos alcanzados y proximos, riesgos materiales que puedan afectar plazo o costo, y las decisiones concretas que el propietario debe tomar. Evita detalle operativo interno (asignaciones de personal, bitacora diaria minuciosa) salvo que sea imprescindible para justificar una decision o un riesgo.`,
  },
  SENIOR_MANAGEMENT: {
    sections: `# Resumen Ejecutivo
# Riesgo de Entrega
# Tendencias de Desempeno
# Responsables y Escalamiento
# Dependencias entre Bloques
# Intervenciones Recomendadas`,
    emphasis: `Enfoque SENIOR_MANAGEMENT: escribe para gerencia senior interna. Prioriza el riesgo de entrega (plazo, calidad, seguridad), tendencias de desempeno de la obra en el periodo, quien es responsable de cada frente y que requiere escalamiento, dependencias entre bloques/partidas, y las intervenciones gerenciales recomendadas.`,
  },
  PERSONAL_FEEDBACK: {
    sections: `# Resumen Ejecutivo
# Contribuciones Individuales
# Calidad y Consistencia de Registros
# Cumplimiento de Seguimientos
# Fortalezas
# Areas de Mejora`,
    emphasis: `Enfoque PERSONAL_FEEDBACK: escribe retroalimentacion sobre las personas que registraron en la obra, agrupando por autor segun los registros proporcionados. Evalua SOLO la calidad, consistencia y oportunidad de sus registros (detalle, frecuencia, cumplimiento de recordatorios) — evidencia documental, nunca opinion. Se constructivo. PROHIBIDO emitir juicios de personal no respaldados por los datos (actitud, caracter, desempeno general, puntualidad fuera de lo aqui documentado, etc. quedan fuera de alcance).`,
  },
};

export function buildInformeSystem(archetype: InformeArchetype): string {
  const spec = ARCHETYPE_SPEC[archetype];
  return `${BASE_RULES}
AUDIENCIA DEL INFORME: ${ARCHETYPE_LABEL_ES[archetype]}
Formato OBLIGATORIO (usa exactamente estos encabezados, en este orden):
${spec.sections}
${spec.emphasis}`;
}

const MAX_PROMPT_REGISTROS = 400;

/** States once which clock the registro times below are on. */
function zoneHeader(tz: string): string {
  if (tz === DEFAULT_APP_TIME_ZONE) return "Horas en hora de República Dominicana (UTC-4)";
  const offset = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  return `Horas en zona ${tz}${offset ? ` (${offset})` : ""}`;
}

export function buildInformeUserMessage(data: ReportData, brief: string): string {
  const lines: string[] = [];
  lines.push(`OBRA: ${data.project.name} (${data.project.registrationCode}) — ${data.project.companyName}`);
  lines.push(`ALCANCE: ${data.scopeLabel}`);
  if (data.from || data.to) lines.push(`PERIODO: ${data.from ? formatPeriodDate(data.from) : "inicio"} a ${data.to ? formatPeriodDate(data.to) : "hoy"}`);
  lines.push(zoneHeader(APP_TIME_ZONE));
  lines.push("", "PARTIDAS Y AVANCE:");
  for (const p of data.partidas) lines.push(`- ${p.name}${p.segmentName ? ` (${p.segmentName})` : ""}: ${p.progressPct}%`);
  lines.push("", `REGISTROS DEL PERIODO (${data.registros.length}):`);
  const shown = data.registros.slice(-MAX_PROMPT_REGISTROS);
  for (const r of shown) {
    lines.push(`- [${zonedTimestamp(r.serverCreatedAt)}] ${r.authorName} @ ${r.partidaName}${r.category ? ` [${r.category}]` : ""}: ${r.text ?? "(solo adjuntos)"}${r.attachmentCount ? ` (${r.attachmentCount} adjuntos)` : ""}`);
  }
  if (data.registros.length > MAX_PROMPT_REGISTROS) {
    lines.push(`- (...y ${data.registros.length - MAX_PROMPT_REGISTROS} registros anteriores omitidos por espacio)`);
  }
  lines.push("", `SOLICITUDES DE CAMBIO (${data.cambios.length}):`);
  for (const c of data.cambios) lines.push(`- ${c.code} ${c.title} [${c.status}]${c.resolutionNote ? ` — ${c.resolutionNote}` : ""}`);
  lines.push("", "SOLICITUD DEL USUARIO (enfoque del informe):", brief);
  return lines.join("\n");
}
