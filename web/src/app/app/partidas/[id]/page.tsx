import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { LogComposer } from "@/components/log-composer";
import { RecordCard } from "@/components/record-card";

export default async function PartidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const { t } = await getDict();
  // Tenant scoping: only return the partida if its project belongs to the caller's company.
  const partida = await prisma.partida.findFirstOrThrow({
    where: { id, project: { companyId } },
    include: { project: true, registros: { orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }] } },
  });

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <Link href={`/app/projects/${partida.projectId}`} className="kicker" style={{ textDecoration: "none" }}>← {partida.project.name}</Link>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 4px" }}>{partida.name}</h1>
      <div className="mono text-steel" style={{ marginBottom: 24, fontSize: "0.8rem" }}>{t.partida.progress} {partida.progressPct}%</div>
      <LogComposer partidaId={partida.id} t={t.composer} />
      {partida.registros.map((r) => <RecordCard key={r.id} r={r} t={t.record} />)}
      {partida.registros.length === 0 && <p className="text-steel">{t.partida.empty}</p>}
    </div>
  );
}
