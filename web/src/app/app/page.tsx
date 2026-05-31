import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createProject, restoreProject } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { ArchiveButton } from "@/components/archive-button";

export default async function Dashboard() {
  const session = await auth();
  const u = session!.user as { companyId: string; role: string };
  const isAdmin = u.role === "ADMIN" || u.role === "MANAGER";
  const { t } = await getDict();
  const D = t.dash;

  const projects = await prisma.project.findMany({
    where: { companyId: u.companyId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const archived = isAdmin
    ? await prisma.project.findMany({ where: { companyId: u.companyId, archivedAt: { not: null } }, orderBy: { archivedAt: "desc" } })
    : [];

  return (
    <div className="reveal">
      <div className="kicker">{D.kicker}</div>
      <h1 className="h-lg" style={{ fontSize: "clamp(2.2rem, 5vw, 3.2rem)", margin: "8px 0 28px" }}>{D.title}</h1>
      {projects.length === 0 && <p className="text-steel" style={{ marginBottom: 20 }}>{D.empty}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 34px" }}>
        {projects.map((p) => (
          <li key={p.id} className="row">
            <Link href={`/app/projects/${p.id}`} className="row-link" style={{ fontSize: "1.2rem" }}>{p.name}</Link>
            {isAdmin ? (
              <ArchiveButton projectId={p.id} t={{ archive: D.archive, confirm: D.confirm, yes: D.yes, no: D.no }} />
            ) : (
              <span className="mono text-steel" style={{ fontSize: "0.8rem" }}>→</span>
            )}
          </li>
        ))}
      </ul>

      <form action={createProject} style={{ display: "flex", gap: 8 }}>
        <input name="name" placeholder={D.newSite} required className="input" style={{ flex: 1 }} />
        <SubmitButton className="btn btn-accent">{D.create}</SubmitButton>
      </form>

      {archived.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>{D.archived}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {archived.map((p) => (
              <li key={p.id} className="row">
                <span className="text-steel" style={{ fontWeight: 600 }}>{p.name}</span>
                <form action={restoreProject}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <SubmitButton className="btn btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.75rem" }}>{D.restore}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
