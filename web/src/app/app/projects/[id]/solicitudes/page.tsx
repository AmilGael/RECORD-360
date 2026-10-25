import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { loadProject } from "@/lib/project/load";
import { requestListLabels } from "@/lib/project/request-list-labels";
import { CambiosList } from "@/components/cambios-list";
import type { Role } from "@prisma/client";

export default async function SolicitudesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sessionUser = session!.user as { id: string; companyId: string; role: Role };
  const { lang, t } = await getDict();

  // Same 404 for a missing id and another tenant's id.
  const project = await loadProject(id, sessionUser.id, sessionUser.companyId, sessionUser.role);
  if (!project) notFound();

  const changeRows = (await prisma.changeRequest.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { partidas: true, segments: true } } },
  })).map((c) => ({
    id: c.id, code: c.code, title: c.title, status: c.status,
    kind: c.kind, severity: c.severity,
    createdAt: c.createdAt, seal: c.seal,
    segmentCount: c._count.segments || c._count.partidas,
  }));

  return (
    <div style={{ marginTop: 16 }}>
      <CambiosList
        projectId={project.id}
        rows={changeRows}
        partidas={project.segments.map((s) => ({ id: s.id, name: s.name }))}
        lang={lang}
        t={requestListLabels(t)}
      />
    </div>
  );
}
