import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { hasCompanyWideAccess } from "@/lib/authz/projects";
import { loadProject } from "@/lib/project/load";
import { projectProgress } from "@/lib/project/progress";
import { registrationQrDataUrl } from "@/lib/project/qr";
import { restoreProject, updateProjectCoverForm } from "@/app/actions/admin";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProjectBackButton } from "@/components/project-back-button";
import { ProjectCover } from "@/components/project-cover";
import { ProjectTabs } from "@/components/project-tabs";
import { RenameProjectForm } from "@/components/project-edit-controls";
import { ArchiveButton } from "@/components/archive-button";
import { PurgeProjectButton } from "@/components/purge-project-button";
import { InlineActionForm } from "@/components/inline-action-form";
import { SubmitButton } from "@/components/submit-button";
import { ProjectAssignmentsPanel } from "@/components/project-assignments-panel";
import type { Role } from "@prisma/client";

/**
 * Shared frame for everything under /app/projects/<id>: cover header, owner
 * controls, assignments and the tab strip. Each tab is its own route and
 * renders below this. A missing id and another tenant's id both give the same
 * 404, because `loadProject` applies the access scope.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const isAdmin = hasCompanyWideAccess(sessionUser.role);
  const isOwner = sessionUser.role === "ADMIN"; // delete/recycle is ADMIN-only
  const { t } = await getDict();
  const P = t.project;

  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();

  const allPartidas = [...project.segments.flatMap((s) => s.partidas), ...project.partidas];
  const avg = projectProgress(allPartidas);
  const assignableUsers = isAdmin
    ? await prisma.user.findMany({
        where: { companyId: sessionUser.companyId, role: { in: ["SUPERVISOR", "RESIDENT"] }, disabledAt: null },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      })
    : [];

  return (
    <div className="reveal">
      <Suspense fallback={null}>
        <ProjectBackButton projectId={project.id} labels={{ label: t.nav.back, aria: t.nav.backAria }} />
      </Suspense>
      <Breadcrumbs
        ariaLabel={t.breadcrumb.aria}
        items={[
          { label: t.nav.sites, href: "/app" },
          { label: project.name },
        ]}
      />

      <div className="project-hero">
        <ProjectCover coverImageKey={project.coverImageKey} name={project.name} variant="hero" />
        <div className="project-hero-title">
          <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)" }}>{project.name}</h1>
          <div className="project-hero-status">
            <span className={`state-badge ${project.archivedAt ? "is-archived" : "is-active"}`}>
              {project.archivedAt ? P.statusArchived : P.statusActive}
            </span>
            {isAdmin && <RenameProjectForm projectId={project.id} currentName={project.name} t={{ rename: P.rename, save: P.save, move: P.move, moveTo: P.moveTo, ungrouped: P.ungrouped }} />}
          </div>
        </div>
      </div>

      {(project.ownerName || project.description) && (
        <div className="mono text-steel" style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 2, margin: "2px 0" }}>
          {project.ownerName && <span>{t.projectFields.owner}: {project.ownerName}</span>}
          {project.description && <span>{t.projectFields.generalDescription}: {project.description}</span>}
        </div>
      )}
      <div className="mono text-steel" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{project.company.name} · {allPartidas.length} {P.partidasWord} · {avg}%</span>
        <span className="sep">·</span>
        <span title={P.registrationCode}>{project.registrationCode}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={await registrationQrDataUrl(project.registrationCode, 64)} alt={project.registrationCode} style={{ width: 44, height: 44 }} />
      </div>
      {isOwner && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <InlineActionForm action={updateProjectCoverForm} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="file" name="cover" required accept="image/jpeg,image/png,image/webp" aria-label={t.dash.cover} style={{ maxWidth: 220 }} />
            <SubmitButton className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.changeCover}</SubmitButton>
          </InlineActionForm>
          {project.archivedAt ? (
            <>
              <form action={restoreProject} style={{ display: "inline" }}>
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{P.restoreProject}</button>
              </form>
              <PurgeProjectButton projectId={project.id} t={{ purge: t.dash.purge, purgeConfirm: t.dash.purgeConfirm, yes: t.dash.yes, no: t.dash.no }} />
            </>
          ) : (
            <ArchiveButton projectId={project.id} t={{ archive: t.dash.archive, confirm: t.dash.confirm, yes: t.dash.yes, no: t.dash.no }} />
          )}
        </div>
      )}
      <ProjectAssignmentsPanel
        projectId={project.id}
        assignments={project.assignments}
        users={assignableUsers}
        canManage={isAdmin}
        t={{
          title: P.assignmentsTitle, supervisor: P.supervisor, resident: P.resident,
          noAssigned: P.noAssigned, assign: P.assign, remove: P.remove,
          chooseUser: P.chooseUser, selectRole: t.admin.selectRole,
        }}
      />

      <ProjectTabs
        projectId={project.id}
        ariaLabel={P.tabsLabel}
        labels={{
          partidas: P.tabPartidas,
          planos: P.tabPlanos,
          solicitudes: P.tabSolicitudes,
          analitica: P.tabAnalytics,
          informes: P.tabInformes,
        }}
      />

      {children}
    </div>
  );
}
