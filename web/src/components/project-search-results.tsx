import Link from "next/link";
import type { ProjectSearchResults as Results } from "@/lib/project/search";

type T = { searchResults: string; searchNoResults: string; searchInPartidas: string; searchInRegistros: string; searchInDocumentos: string; searchInCambios: string };

export function ProjectSearchResultsPanel({ projectId, results, t }: { projectId: string; results: Results; t: T }) {
  const empty = !results.partidas.length && !results.registros.length && !results.documentos.length && !results.cambios.length;
  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>{t.searchResults}</div>
      {empty && <p className="mono text-steel" style={{ fontSize: "0.78rem", margin: 0 }}>{t.searchNoResults}</p>}
      {results.partidas.length > 0 && (
        <Group label={t.searchInPartidas}>
          {results.partidas.map((p) => (
            <Link key={p.id} href={`/app/partidas/${p.id}`} className="search-hit">{p.name}</Link>
          ))}
        </Group>
      )}
      {results.registros.length > 0 && (
        <Group label={t.searchInRegistros}>
          {results.registros.map((r) => (
            <Link key={r.id} href={`/app/partidas/${r.partidaId}`} className="search-hit">
              <span className="mono text-steel">[{r.partidaName}]</span> {(r.text ?? "").slice(0, 110)}
            </Link>
          ))}
        </Group>
      )}
      {results.documentos.length > 0 && (
        <Group label={t.searchInDocumentos}>
          {results.documentos.map((d) => (
            <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="search-hit">{d.title ?? d.url.split("/").pop()}</a>
          ))}
        </Group>
      )}
      {results.cambios.length > 0 && (
        <Group label={t.searchInCambios}>
          {results.cambios.map((c) => (
            <Link key={c.id} href={`/app/projects/${projectId}/cambios/${c.id}`} className="search-hit">{c.code} · {c.title}</Link>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="form-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </div>
  );
}
