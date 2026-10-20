import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createProjectForm, restoreProject } from "@/app/actions/admin";
import { InlineActionForm } from "@/components/inline-action-form";
import { PurgeProjectButton } from "@/components/purge-project-button";
import { SubmitButton } from "@/components/submit-button";
import { ArchiveButton } from "@/components/archive-button";
import { projectProgress } from "@/lib/project/progress";
import { formatDate, formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { DashboardSearch } from "@/components/dashboard-search";
import { foldForSearch } from "@/lib/text/fold";
import { BackButton } from "@/components/back-button";
import { Folder, Plus } from "@/components/icons";
import { hasCompanyWideAccess, projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; sort?: string; dir?: string }> }) {
  const session = await auth();
  const u = session!.user as { id: string; companyId: string; role: Role };
  const isAdmin = hasCompanyWideAccess(u.role);
  const isOwner = u.role === "ADMIN"; // only ADMIN may archive/restore (delete) projects
  const { lang, t } = await getDict();
  const D = t.dash;
  const { view, sort, dir } = await searchParams;

  // Table view: sortable general table for activas / archivadas
  const tableView = view === "activas" ? "activas" : view === "archivadas" && isAdmin ? "archivadas" : null;
  if (tableView) {
    let tableRows: { id: string; name: string; code: string; progress: number; resident: string; createdAt: Date }[] = [];
    const rows = await prisma.project.findMany({
      where: tableView === "activas"
        ? { ...projectAccessWhere(u), archivedAt: null }
        : { companyId: u.companyId, archivedAt: { not: null } },
      include: {
        partidas: { where: { deletedAt: null }, select: { progressPct: true } },
        assignments: { where: { role: "RESIDENT" }, take: 1, include: { user: { select: { name: true } } } },
      },
    });
    tableRows = rows.map((p) => ({
      id: p.id, name: p.name, code: p.registrationCode,
      progress: projectProgress(p.partidas),
      resident: p.assignments[0]?.user.name ?? "—",
      createdAt: p.createdAt,
    }));
    const key = (["name", "code", "progress", "resident", "date"].includes(String(sort)) ? String(sort) : "name") as "name" | "code" | "progress" | "resident" | "date";
    const mul = dir === "desc" ? -1 : 1;
    tableRows.sort((a, b) => {
      if (key === "progress") return (a.progress - b.progress) * mul;
      if (key === "date") return (a.createdAt.getTime() - b.createdAt.getTime()) * mul;
      const av = key === "name" ? a.name : key === "code" ? a.code : a.resident;
      const bv = key === "name" ? b.name : key === "code" ? b.code : b.resident;
      return av.localeCompare(bv) * mul;
    });
    const th = (label: string, key: string) => {
      const nextDir = sort === key && dir !== "desc" ? "desc" : "asc";
      return (
        <th style={{ textAlign: "left", padding: "8px 10px" }}>
          <Link href={`/app?view=${tableView}&sort=${key}&dir=${nextDir}`} style={{ textDecoration: "none", color: "inherit" }}>
            {label}{sort === key ? (dir === "desc" ? " ↓" : " ↑") : ""}
          </Link>
        </th>
      );
    };
    return (
      <div className="reveal">
        <BackButton fallbackHref="/app" labels={{ label: t.nav.back, aria: t.nav.backAria }} />
        <h1 className="h-lg" style={{ margin: "10px 0 16px" }}>{tableView === "activas" ? D.tableTitleActive : D.tableTitleArchived}</h1>
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="dash-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead><tr className="mono" style={{ fontSize: "0.7rem", borderBottom: "1px solid var(--line-strong)" }}>
              {th(D.colName, "name")}{th(D.colCode, "code")}{th(D.colProgress, "progress")}{th(D.colResident, "resident")}{th(D.colDate, "date")}
            </tr></thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line, #8884)" }}>
                  <td data-label={D.colName} style={{ padding: "8px 10px" }}><Link href={`/app/projects/${r.id}`} style={{ color: "inherit" }}>{r.name}</Link></td>
                  <td data-label={D.colCode} className="mono" style={{ padding: "8px 10px", fontSize: "0.74rem" }}>{r.code}</td>
                  <td data-label={D.colProgress} style={{ padding: "8px 10px" }}>{r.progress}%</td>
                  <td data-label={D.colResident} style={{ padding: "8px 10px" }}>{r.resident}</td>
                  <td data-label={D.colDate} className="mono" style={{ padding: "8px 10px", fontSize: "0.74rem" }}>{formatDate(r.createdAt, lang as Lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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

  const projectRows = projects.map((p) => {
    const pct = projectProgress(p.partidas);
    // Find the most recent registro across all partidas.
    let latest: { serverCreatedAt: Date; authorId: string; hash: string } | null = null;
    for (const pa of p.partidas) {
      const r = pa.registros[0];
      if (r && (!latest || r.serverCreatedAt > latest.serverCreatedAt)) {
        latest = r;
      }
    }
    return {
      id: p.id,
      name: p.name,
      progress: pct,
      partidas: p.partidas.length,
      latestAuthor: latest ? authorMap.get(latest.authorId) ?? "—" : null,
      latestTime: latest ? formatTimestamp(latest.serverCreatedAt, lang as Lang) : null,
      latestHash: latest ? latest.hash : null,
      coverImageKey: p.coverImageKey,
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
        {/* The comp's promise: the yard's count as a display-scale stencil
            numeral, with the breakdown in the meta voice beneath it. */}
        <span className="counter">
          <span className="counter-stencil" aria-hidden="true">{String(projectRows.length).padStart(2, "0")}</span>
          <span>{projectRows.length} {D.tabActive.toLowerCase()} · {archived.length} {D.tabArchived.toLowerCase()}</span>
        </span>
      </div>

      {/* Dual chart-buttons */}
      <div className="dash-metric-grid">
        <Link href="/app?view=activas" className="card dash-metric-card">
          <div>
            <div className="kicker">{D.tabActive}</div>
            <strong style={{ fontSize: "2rem" }}>{projectRows.length}</strong>
          </div>
          <span className="mono text-steel">{D.openTable} &rarr;</span>
        </Link>
        {isAdmin ? (
          <Link href="/app?view=archivadas" className="card dash-metric-card">
            <div>
              <div className="kicker">{D.tabArchived}</div>
              <strong style={{ fontSize: "2rem" }}>{archived.length}</strong>
            </div>
            <span className="mono text-steel">{D.openTable} &rarr;</span>
          </Link>
        ) : <div />}
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
            {projectRows.map((p, i) => (
              <div key={p.id} className="repo-card" data-name={foldForSearch(p.name)}>
                {/* The plate's painted index — position in the yard, not an id. */}
                <span className="plate-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <Link href={`/app/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
                  <div className="repo-title">
                    {p.coverImageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${p.coverImageKey}`} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
                    ) : (
                      <span className="folder-icon"><Folder size={14} /></span>
                    )}
                    {p.name}
                  </div>
                  <div className="repo-meta">
                    <span>{p.partidas} {D.partidas}</span>
                    <span className="sep">·</span>
                    {/* The plate band (bottom edge) is the progress visualization
                        now — a second track widget here would say it twice. The
                        number stays as data in the meta voice. */}
                    <span className="progress-label">{p.progress}%</span>
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
                  <div style={{ marginTop: 8, gridColumn: 2 }}>
                    <ArchiveButton projectId={p.id} t={{ archive: D.archive, confirm: D.confirm, yes: D.yes, no: D.no }} />
                  </div>
                )}
                {/* Progress as paint on the plate's bottom edge (comp A). */}
                <span className="plate-band-track" aria-hidden="true" />
                <span className={`plate-band${p.progress >= 100 ? " is-done" : ""}`} style={{ width: `${p.progress}%` }} aria-hidden="true" />
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
                        <span style={{ color: "var(--ink-soft)" }}>{p.name}</span>
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
          <details className="panel-create" open={projectRows.length === 0}>
            <summary className="panel-create-summary">
              <span className="panel-create-icon" aria-hidden="true"><Plus size={17} /></span>
              <span className="panel-create-copy">
                <strong>{D.panelTitle}</strong>
                <span>{D.panelHint}</span>
              </span>
              <span className="panel-create-toggle">
                <span className="when-closed">{D.panelExpand}</span>
                <span className="when-open">{D.panelCollapse}</span>
                <span className="panel-create-chevron" aria-hidden="true">⌄</span>
              </span>
            </summary>
            <InlineActionForm action={createProjectForm} className="panel-create-body">
              <p className="panel-create-required">{D.requiredHint}</p>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-name">{D.newSite} *</label>
                <input id="dash-name" name="name" placeholder="Torre Piantini 05" required className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-desc">{D.newSiteDesc}</label>
                <input id="dash-desc" name="description" placeholder="Av. Winston Churchill, Ens. Naco" className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-owner">{t.projectFields.owner}</label>
                <input id="dash-owner" name="ownerName" placeholder={t.projectFields.ownerPlaceholder} className="input" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dash-cover">{D.cover}</label>
                {/* No .input frame: file pickers get the global ::file-selector-button
                    treatment; boxing that button inside a text-field border reads
                    as a control within a control. */}
                <input id="dash-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" />
              </div>
              <SubmitButton className="btn btn-accent" style={{ width: "100%", marginTop: 4 }}>
                {D.create} <span className="arrow">→</span>
              </SubmitButton>
            </InlineActionForm>
          </details>
        )}
      </div>
    </div>
  );
}
