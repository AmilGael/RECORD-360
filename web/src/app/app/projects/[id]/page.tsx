import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createPartida } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const { t } = await getDict();
  const P = t.project;
  // Tenant scoping: only return the project if it belongs to the caller's company.
  const project = await prisma.project.findFirstOrThrow({ where: { id, companyId }, include: { partidas: { orderBy: { createdAt: "desc" } } } });

  return (
    <div className="reveal">
      <Link href="/app" className="kicker" style={{ textDecoration: "none" }}>← {P.back}</Link>
      <h1 className="h-lg" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)", margin: "10px 0 24px" }}>{project.name}</h1>
      {project.partidas.length === 0 && <p className="text-steel" style={{ marginBottom: 18 }}>{P.empty}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 30px" }}>
        {project.partidas.map((pa) => (
          <li key={pa.id} className="row">
            <Link href={`/app/partidas/${pa.id}`} className="row-link">{pa.name}</Link>
            <span className="mono text-steel" style={{ fontSize: "0.82rem" }}>{pa.progressPct}%</span>
          </li>
        ))}
      </ul>
      <form action={createPartida} style={{ display: "flex", gap: 8 }}>
        <input type="hidden" name="projectId" value={project.id} />
        <input name="name" placeholder={P.newPartida} required className="input" style={{ flex: 1 }} />
        <SubmitButton className="btn btn-accent">{P.add}</SubmitButton>
      </form>
    </div>
  );
}
