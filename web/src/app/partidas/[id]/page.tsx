import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { LogComposer } from "@/components/log-composer";
import { RecordCard } from "@/components/record-card";

export default async function PartidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  // Tenant scoping: only return the partida if its project belongs to the caller's company.
  const partida = await prisma.partida.findFirstOrThrow({
    where: { id, project: { companyId } },
    include: { project: true, registros: { orderBy: [{ serverCreatedAt: "desc" }, { id: "desc" }] } },
  });
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 40 }}>
      <Link href={`/projects/${partida.projectId}`} className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>← {partida.project.name}</Link>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: "8px 0 4px" }}>{partida.name}</h1>
      <div className="mono" style={{ color: "var(--steel)", marginBottom: 24 }}>AVANCE {partida.progressPct}%</div>
      <LogComposer partidaId={partida.id} />
      {partida.registros.map((r) => <RecordCard key={r.id} r={r} />)}
      {partida.registros.length === 0 && <p style={{ color: "var(--steel)" }}>Aún no hay registros. Crea el primero arriba.</p>}
    </main>
  );
}
