import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { loadProject } from "@/lib/project/load";
import { projectProgress } from "@/lib/project/progress";
import { getProjectAnalytics } from "@/lib/analytics/project";
import { AnaliticaTab } from "@/components/analitica-tab";
import type { Role } from "@prisma/client";

export default async function AnaliticaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const { lang, t } = await getDict();
  const P = t.project;

  // Same 404 for a missing id and another tenant's id.
  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const avg = projectProgress(allPartidas);

  const now = new Date();
  const overdueReminders = await prisma.registro.count({
    where: { partida: { projectId: id, deletedAt: null }, reminderDueAt: { lt: now }, reminderResolvedAt: null },
  });
  const analytics = await getProjectAnalytics(sessionUser, id);
  if (!analytics) notFound();

  // WS6: `completed` (Partida.completedAt != null) threads the real lifecycle
  // state through so the analítica progress bar only shows green ("is-done")
  // for an actually-concluded partida, never for an aggregate that happens to
  // read 100%.
  const analiticaBloques = project.segments.map((s) => ({
    id: s.id, name: s.name, progress: projectProgress(s.partidas), closedAt: s.closedAt,
    partidas: s.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct, completed: p.completedAt != null })),
  }));
  const analiticaUngrouped = project.partidas.map((p) => ({ id: p.id, name: p.name, progressPct: p.progressPct, completed: p.completedAt != null }));
  const concludedCount = analytics.status.reduce((s, r) => s + r.concluded, 0);

  return (
    <AnaliticaTab
      projectId={project.id}
      lang={lang}
      general={{
        progress: avg,
        concluded: concludedCount,
        partidas: allPartidas.length,
        openCambios: analytics.requests.open,
        criticalAlerts: analytics.requests.criticalAlerts,
        overdueReminders,
        last7Days: analytics.weekly.last7Days,
        photoPct: analytics.photo.overall.pct,
      }}
      bloques={analiticaBloques}
      ungrouped={analiticaUngrouped}
      analytics={analytics}
      t={{
        ...P.analitica,
        general: P.analiticaGeneral,
        byBloque: P.analiticaByBloque,
        openChanges: P.analiticaOpenChanges,
        overdue: P.analiticaOverdue,
        partidasWord: P.partidasWord,
        noBloques: P.analiticaNoBloques,
        ungrouped: P.ungrouped,
        aging7: P.aging7,
        aging14: P.aging14,
        noActivity: P.noActivity,
        blockClosed: t.lifecycle.blockClosed,
        severityImportant: t.requests.severityImportant,
        severityCritical: t.requests.severityCritical,
      }}
    />
  );
}
