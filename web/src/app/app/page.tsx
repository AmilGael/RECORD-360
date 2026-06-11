import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createProject, restoreProject } from "@/app/actions/admin";
import { PurgeProjectButton } from "@/components/purge-project-button";
import { SubmitButton } from "@/components/submit-button";
import { ArchiveButton } from "@/components/archive-button";
import { projectProgress } from "@/lib/project/progress";
import { formatTimestamp } from "@/lib/format/datetime";
import { buildDashboardAnalytics } from "@/lib/dashboard/analytics";
import type { Lang } from "@/i18n/dictionaries";
import { DashboardSearch } from "@/components/dashboard-search";
import { Folder, Plus } from "@/components/icons";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export default async function Dashboard() {
  const session = await auth();
  const u = session!.user as { id: string; companyId: string; role: Role };
  const isAdmin = hasCompanyWideAccess(u.role);
  const isOwner = u.role === "ADMIN"; // only ADMIN may archive/restore (delete) projects
  const { lang, t } = await getDict();
  const D = t.dash;

  // Fetch active projects with their partidas AND the single most-recent registro per project
  const projects = await prisma.project.findMany({
    where: { ...projectAccessWhere(u), archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      partidas: {
        where: { deletedAt: null },
        select: {
          progressPct: true,
          registros: {
            orderBy: { serverCreatedAt: "desc" },
            take: 1,
            select: { serverCreatedAt: true, authorId: true, hash: true },
          },
        },
      },
    },
  });

  // Fetch author names for the most recent registros
  const authorIds = new Set<string>();
  for (const p of projects) {
    for (const pa of p.partidas) {
      if (pa.registros[0]) authorIds.add(pa.registros[0].authorId);
    }
  }
  const authors = authorIds.size > 0
    ? await prisma.user.findMany({ where: { id: { in: [...authorIds] }, companyId: u.companyId }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  const now = new Date();
  const projectRows = await Promise.all(projects.map(async (p) => {
    const pct = projectProgress(p.partidas);
    // Find the most recent registro across all partidas.
    let latest: { serverCreatedAt: Date; authorId: string; hash: string } | null = null;
    for (const pa of p.partidas) {
      const r = pa.registros[0];
      if (r && (!latest || r.serverCreatedAt > latest.serverCreatedAt)) {
        latest = r;
      }
    }
    const [openChanges, overdueReminders] = await Promise.all([
      prisma.changeRequest.count({ where: { projectId: p.id, status: "OPEN" } }),
      prisma.registro.count({
        where: {
          partida: { projectId: p.id, deletedAt: null },
          reminderDueAt: { lt: now },
          reminderResolvedAt: null,
        },
      }),
    ]);
    return {
      id: p.id,
      name: p.name,
      progress: pct,
      partidas: p.partidas.length,
      openChanges,
      overdueReminders,
      latestAuthor: latest ? authorMap.get(latest.authorId) ?? "—" : null,
      latestTime: latest ? formatTimestamp(latest.serverCreatedAt, lang as Lang) : null,
      latestHash: latest ? latest.hash : null,
      coverImageKey: p.coverImageKey,
    };
  }));
  const dashboard = buildDashboardAnalytics(projectRows);

  const archived = isAdmin
    ? await prisma.project.findMany({
        where: { companyId: u.companyId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
      })
    : [];

  return (
    <div className="reveal">
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="kicker">{D.kicker}</div>
          <h1 className="h-lg" style={{ fontSize: "clamp(2rem, 4.5vw, 2.8rem)", margin: "6px 0 0" }}>{D.title}</h1>
        </div>
        <span className="counter">
          {dashboard.totalProjects} {D.tabActive.toLowerCase()} · {archived.length} {D.tabArchived.toLowerCase()}
        </span>
      </div>

      <div className="dash-analytics">
        <div className="dash-analytics-stack">
          <div className="analitica-cards">
            <div className="analitica-card">
              <span className={`health-dot ${dashboard.portfolioHealth}`} aria-hidden="true" />
              <strong>{dashboard.avgProgress}%</strong>
              <span>{D.analyticsProgress}</span>
            </div>
            <div className="analitica-card">
              <strong>{dashboard.totalPartidas}</strong>
              <span>{D.analyticsPartidas}</span>
            </div>
            <div className="analitica-card">
              <strong>{dashboard.openChanges}</strong>
              <span>{D.analyticsOpenChanges}</span>
            </div>
            <div className="analitica-card">
              <strong>{dashboard.overdueReminders}</strong>
              <span>{D.analyticsOverdue}</span>
            </div>
          </div>

          <div className="dash-analytics-panel">
            <div className="kicker">{D.analyticsHealth}</div>
            <div className="dash-health-list">
              {([
                ["green", D.analyticsGreen, dashboard.healthCounts.green],
                ["yellow", D.analyticsYellow, dashboard.healthCounts.yellow],
                ["red", D.analyticsRed, dashboard.healthCounts.red],
              ] as const).map(([level, label, count]) => {
                const total = dashboard.totalProjects || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={level} className="dash-health-row">
                    <span className="dash-health-label">
                      <span className={`health-dot ${level}`} aria-hidden="true" />
                      {label}
                    </span>
                    <div className="dash-health-track" aria-hidden="true">
                      <span className={`dash-health-fill ${level}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="dash-health-count mono">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="dash-analytics-panel dash-risk-panel">
          <div className="kicker">{D.analyticsRisk}</div>
          {dashboard.topRiskProjects.length === 0 ? (
            <p className="text-steel" style={{ margin: "8px 0 0" }}>{D.analyticsNoRisk}</p>
          ) : (
            <div className="dash-risk-list">
              {dashboard.topRiskProjects.map((p) => (
                <Link key={p.id} href={`/app/projects/${p.id}?tab=analitica`} className="dash-risk-item">
                  <div className="dash-risk-name">
                    <span className={`health-dot ${p.health}`} aria-hidden="true" />
                    <span>{p.name}</span>
                    <span className="state-badge is-active">{p.progress}%</span>
                  </div>
                  <div className="dash-risk-track">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <div className="dash-risk-meta">
                    <span>{p.partidas} {D.analyticsPartidas}</span>
                    <span className="sep">·</span>
                    <span>{p.openChanges} {D.analyticsOpenChanges}</span>
                    <span className="sep">·</span>
                    <span>{p.overdueReminders} {D.analyticsOverdue}</span>
                    {p.latestTime && (
                      <>
                        <span className="sep">·</span>
                        <span>{D.lastBy} {p.latestAuthor} · {p.latestTime}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dual-column layout */}
      <div className="dash-layout">
        {/* Left column: project explorer */}
        <div>
          <DashboardSearch placeholder={D.search} />

          {/* Active projects */}
          <div className="repo-list" id="dash-active-list">
            {projectRows.length === 0 && (
              <div className="repo-list-empty">{D.empty}</div>
            )}
            {projectRows.map((p) => (
              <div key={p.id} className="repo-card" data-name={p.name.toLowerCase()}>
                <Link href={`/app/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="repo-title">
                    {p.coverImageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${p.coverImageKey}`} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
                    ) : (
                      <span className="folder-icon"><Folder size={14} /></span>
                    )}
                    {p.name}
                    <span className="state-badge is-active" style={{ marginLeft: 4 }}>
                      {t.project.statusActive}
                    </span>
                  </div>
                  <div className="repo-meta">
                    <span>{p.partidas} {D.partidas}</span>
                    <span className="sep">·</span>
                    <div className="progress-bar">
                      <div className="progress-track">
                        <div
                          className={`progress-fill${p.progress >= 100 ? " is-done" : ""}`}
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="progress-label">{p.progress}%</span>
                    </div>
                    {p.latestTime && (
                      <>
                        <span className="sep">·</span>
                        <span>{D.lastBy} {p.latestAuthor} · {p.latestTime}</span>
                      </>
                    )}
                    {p.latestHash && (
                      <>
                        <span className="sep">·</span>
                        <span>{p.latestHash.slice(0, 7)}</span>
                      </>
                    )}
                    {!p.latestTime && (
                      <>
                        <span className="sep">·</span>
                        <span>{D.noUpdates}</span>
                      </>
                    )}
                  </div>
                </Link>
                {isOwner && (
                  <div style={{ marginTop: 8 }}>
                    <ArchiveButton projectId={p.id} t={{ archive: D.archive, confirm: D.confirm, yes: D.yes, no: D.no }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Archived section */}
          {archived.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>{D.archived}</div>
              <div className="repo-list">
                {archived.map((p) => (
                  <div key={p.id} className="repo-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div className="repo-title">
                        <span className="folder-icon" style={{ opacity: 0.4 }}><Folder size={14} /></span>
                        <span style={{ color: "var(--steel)" }}>{p.name}</span>
                        <span className="state-badge is-archived">{t.project.statusArchived}</span>
                      </div>
                    </div>
                    {isOwner && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <form action={restoreProject}>
                          <input type="hidden" name="projectId" value={p.id} />
                          <SubmitButton className="btn btn-ghost" style={{ padding: "0.35rem 0.8rem", fontSize: "0.75rem" }}>
                            {D.restore}
                          </SubmitButton>
                        </form>
                        <PurgeProjectButton
                          projectId={p.id}
                          t={{ purge: D.purge, purgeConfirm: D.purgeConfirm, yes: D.yes, no: D.no }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: create panel */}
        {isAdmin && (
          <div className="panel-create">
            <div className="panel-create-head">
              <Plus size={14} /> {D.panelTitle}
            </div>
            <form action={createProject} className="panel-create-body">
              <div className="form-group">
                <label className="form-label" htmlFor="dash-name">{D.newSite} *</label>
                <input id="dash-name" name="name" placeholder="Torre Piantini 05" required className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-desc">{D.newSiteDesc}</label>
                <input id="dash-desc" name="description" placeholder="Av. Winston Churchill, Ens. Naco" className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-cover">{D.cover}</label>
                <input id="dash-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="input" style={{ padding: 6 }} />
              </div>
              <SubmitButton className="btn btn-accent" style={{ width: "100%", marginTop: 4 }}>
                {D.create} <span className="arrow">→</span>
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
