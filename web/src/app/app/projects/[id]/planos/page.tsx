import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { hasCompanyWideAccess } from "@/lib/authz/projects";
import { loadProject } from "@/lib/project/load";
import { PlanosTab } from "@/components/planos-tab";
import type { Role } from "@prisma/client";

export default async function PlanosPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pq?: string }>;
}) {
  const { id } = await params;
  const { pq } = await searchParams;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const { lang, t } = await getDict();
  const isAdmin = hasCompanyWideAccess(sessionUser.role);

  // Same 404 for a missing id and another tenant's id.
  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();
  const canEditStructure = isAdmin || project.assignments.some((a) => a.userId === sessionUser.id);

  const docs = await prisma.document.findMany({
    where: { projectId: id, kind: { in: ["PLANO", "PLANO_ACTUALIZADO"] } },
    orderBy: { createdAt: "desc" },
  });
  const uploaderIds = [...new Set(docs.map((d) => d.uploadedById))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds }, companyId: sessionUser.companyId }, select: { id: true, name: true } })
    : [];
  const docAuthorMap = new Map(uploaders.map((u) => [u.id, u.name]));

  return (
    <div style={{ marginTop: 16 }}>
      <PlanosTab
        projectId={project.id}
        docs={docs}
        authorMap={docAuthorMap}
        lang={lang}
        isAdmin={isAdmin}
        canEdit={canEditStructure}
        initialQuery={typeof pq === "string" ? pq : ""}
        t={{
          empty: t.planos.empty, upload: t.planos.uploadByKind.PLANO, file: t.planos.file, title: t.planos.title,
          error: t.planos.error, uploadedBy: t.planos.uploadedBy, view: t.planos.view,
          search: t.planos.search, searchCount: t.planos.searchCount, searchEmpty: t.planos.searchEmpty,
          searchClear: t.planos.searchClear, updated: t.planos.updated, defaultName: t.planos.defaultName,
          backfill: t.planos.backfill, backfillProgress: t.planos.backfillProgress, backfillDone: t.planos.backfillDone,
        }}
      />
    </div>
  );
}
