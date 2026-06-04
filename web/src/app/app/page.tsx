import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createProject, restoreProject } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { ArchiveButton } from "@/components/archive-button";
import { projectProgress } from "@/lib/project/progress";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { DashboardSearch } from "@/components/dashboard-search";
import { Folder, Plus } from "@/components/icons";

export default async function Dashboard() {
  const session = await auth();
  const u = session!.user as { companyId: string; role: string };
  const isAdmin = u.role === "ADMIN" || u.role === "MANAGER";
  const { lang, t } = await getDict();
  const D = t.dash;

  // Fetch active projects with their partidas AND the single most-recent registro per project
  const projects = await prisma.project.findMany({
    where: { companyId: u.companyId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      partidas: {
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
    ? await prisma.user.findMany({ where: { id: { in: [...authorIds] } }, select: { id: true, name: true } })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a.name]));

  // Pre-compute per-project metadata
  const projectMeta = projects.map((p) => {
    const pct = projectProgress(p.partidas);
    // Find the most recent registro across all partidas
    let latest: { serverCreatedAt: Date; authorId: string; hash: string } | null = null;
    for (const pa of p.partidas) {
      const r = pa.registros[0];
      if (r && (!latest || r.serverCreatedAt > latest.serverCreatedAt)) {
        latest = r;
      }
    }
    return {
      ...p,
      pct,
      latestAuthor: latest ? authorMap.get(latest.authorId) ?? "—" : null,
      latestTime: latest ? formatTimestamp(latest.serverCreatedAt, lang as Lang) : null,
      latestHash: latest ? latest.hash : null,
    };
  });

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
          {projects.length} {D.tabActive.toLowerCase()} · {archived.length} {D.tabArchived.toLowerCase()}
        </span>
      </div>

      {/* Dual-column layout */}
      <div className="dash-layout">
        {/* Left column: project explorer */}
        <div>
          <DashboardSearch placeholder={D.search} />

          {/* Active projects */}
          <div className="repo-list" id="dash-active-list">
            {projectMeta.length === 0 && (
              <div className="repo-list-empty">{D.empty}</div>
            )}
            {projectMeta.map((p) => (
              <div key={p.id} className="repo-card" data-name={p.name.toLowerCase()}>
                <Link href={`/app/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="repo-title">
                    <span className="folder-icon"><Folder size={14} /></span>
                    {p.name}
                    <span className="state-badge is-active" style={{ marginLeft: 4 }}>
                      {t.project.statusActive}
                    </span>
                  </div>
                  <div className="repo-meta">
                    <span>{p.partidas.length} {D.partidas}</span>
                    <span className="sep">·</span>
                    <div className="progress-bar">
                      <div className="progress-track">
                        <div
                          className={`progress-fill${p.pct >= 100 ? " is-done" : ""}`}
                          style={{ width: `${p.pct}%` }}
                        />
                      </div>
                      <span className="progress-label">{p.pct}%</span>
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
                {isAdmin && (
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
                    <form action={restoreProject}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <SubmitButton className="btn btn-ghost" style={{ padding: "0.35rem 0.8rem", fontSize: "0.75rem" }}>
                        {D.restore}
                      </SubmitButton>
                    </form>
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
