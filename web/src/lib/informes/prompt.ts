import type { ReportData } from "@/lib/report/data";

/**
 * Fixed report format (spec R2.2): the informe always carries these sections,
 * in Spanish, regardless of what the user asks for in the brief.
 */
export const INFORME_SYSTEM = `Eres el redactor tecnico de Raphel, la bitacora digital inalterable de obras de construccion en la Republica Dominicana.
Redactas informes ejecutivos de obra en espanol, sobrios y precisos, SOLO con los datos proporcionados — nunca inventes hechos, cifras ni fechas.
Formato OBLIGATORIO (markdown simple, sin tablas ni enlaces ni emojis):
# Resumen Ejecutivo
# Avance de Obra
# Eventualidades y Observaciones
# Solicitudes de Cambio
# Recomendaciones
Si una seccion no tiene datos, escribe "Sin novedades en el periodo."
Maximo 900 palabras. No incluyas encabezado de obra ni firmas: el PDF los agrega.`;

export function buildInformeUserMessage(data: ReportData, brief: string): string {
  const lines: string[] = [];
  lines.push(`OBRA: ${data.project.name} (${data.project.registrationCode}) — ${data.project.companyName}`);
  lines.push(`ALCANCE: ${data.scopeLabel}`);
  if (data.from || data.to) lines.push(`PERIODO: ${data.from?.toISOString().slice(0, 10) ?? "inicio"} a ${data.to?.toISOString().slice(0, 10) ?? "hoy"}`);
  lines.push("", "PARTIDAS Y AVANCE:");
  for (const p of data.partidas) lines.push(`- ${p.name}${p.segmentName ? ` (${p.segmentName})` : ""}: ${p.progressPct}%`);
  lines.push("", `REGISTROS DEL PERIODO (${data.registros.length}):`);
  for (const r of data.registros) {
    lines.push(`- [${r.serverCreatedAt.toISOString().slice(0, 16).replace("T", " ")}] ${r.authorName} @ ${r.partidaName}${r.category ? ` [${r.category}]` : ""}: ${r.text ?? "(solo adjuntos)"}${r.attachmentCount ? ` (${r.attachmentCount} adjuntos)` : ""}`);
  }
  lines.push("", `SOLICITUDES DE CAMBIO (${data.cambios.length}):`);
  for (const c of data.cambios) lines.push(`- ${c.code} ${c.title} [${c.status}]${c.resolutionNote ? ` — ${c.resolutionNote}` : ""}`);
  lines.push("", "SOLICITUD DEL USUARIO (enfoque del informe):", brief);
  return lines.join("\n");
}
