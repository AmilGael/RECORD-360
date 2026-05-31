import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { createProject } from "./actions/admin";

export default async function Dashboard() {
  const session = await auth();
  const companyId = (session!.user as { companyId: string }).companyId;
  const projects = await prisma.project.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: "var(--steel)" }}>RECORD 360 · OBRAS</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/admin" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", textDecoration: "none" }}>Equipo</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button style={{ fontSize: 13, fontWeight: 600, color: "var(--steel)", background: "none", border: "none", cursor: "pointer" }}>Salir</button>
          </form>
        </div>
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 900, margin: "8px 0 28px" }}>Tus obras</h1>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 40 }}>
        {projects.map((p) => (
          <li key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "16px 0" }}>
            <Link href={`/projects/${p.id}`} style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{p.name} →</Link>
          </li>
        ))}
      </ul>
      <form action={createProject} style={{ display: "flex", gap: 8 }}>
        <input name="name" placeholder="Nombre de la obra" required style={{ flex: 1, padding: 10, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Crear</button>
      </form>
    </main>
  );
}
