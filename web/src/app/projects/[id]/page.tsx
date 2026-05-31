import { prisma } from "@/lib/db";
import Link from "next/link";
import { createPartida } from "@/app/actions/admin";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: { partidas: { orderBy: { createdAt: "desc" } } } });
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40 }}>
      <Link href="/" className="mono" style={{ fontSize: 12, color: "var(--steel)" }}>← OBRAS</Link>
      <h1 style={{ fontSize: 36, fontWeight: 900, margin: "8px 0 24px" }}>{project.name}</h1>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 32 }}>
        {project.partidas.map((pa) => (
          <li key={pa.id} style={{ borderTop: "1px solid var(--line)", padding: "14px 0", display: "flex", justifyContent: "space-between" }}>
            <Link href={`/partidas/${pa.id}`} style={{ fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{pa.name} →</Link>
            <span className="mono" style={{ color: "var(--steel)" }}>{pa.progressPct}%</span>
          </li>
        ))}
      </ul>
      <form action={createPartida} style={{ display: "flex", gap: 8 }}>
        <input type="hidden" name="projectId" value={project.id} />
        <input name="name" placeholder="Nueva partida (p. ej. Vaciado losa N3)" required style={{ flex: 1, padding: 10, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 3, fontWeight: 700 }}>Añadir</button>
      </form>
    </main>
  );
}
