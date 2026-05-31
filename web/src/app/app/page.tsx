import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { createProject } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

export default async function Dashboard() {
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const { t } = await getDict();
  const D = t.dash;
  const projects = await prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });

  return (
    <div className="reveal">
      <div className="kicker">{D.kicker}</div>
      <h1 className="h-lg" style={{ fontSize: "clamp(2.2rem, 5vw, 3.2rem)", margin: "8px 0 28px" }}>{D.title}</h1>
      {projects.length === 0 && <p className="text-steel" style={{ marginBottom: 20 }}>{D.empty}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 34px" }}>
        {projects.map((p) => (
          <li key={p.id} className="row">
            <Link href={`/app/projects/${p.id}`} className="row-link" style={{ fontSize: "1.2rem" }}>{p.name}</Link>
            <span className="mono text-steel" style={{ fontSize: "0.8rem" }}>→</span>
          </li>
        ))}
      </ul>
      <form action={createProject} style={{ display: "flex", gap: 8 }}>
        <input name="name" placeholder={D.newSite} required className="input" style={{ flex: 1 }} />
        <SubmitButton className="btn btn-accent">{D.create}</SubmitButton>
      </form>
    </div>
  );
}
