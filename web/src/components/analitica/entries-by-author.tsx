import type { AuthorCount } from "@/lib/analytics/project";

function fill(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export function EntriesByAuthorChart({ rows, t }: {
  rows: AuthorCount[];
  t: {
    title: string; summary: string; viewData: string; empty: string;
    person: string; count: string; unnamed: string;
  };
}) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const summary = fill(t.summary, total);
  const max = Math.max(...rows.map((r) => r.n), 1);
  const vbW = 240;
  const rowH = 18;
  const labelW = 88;
  const vbH = Math.max(rows.length * rowH, rowH);

  return (
    <section className="analitica-chart">
      <h2 className="kicker">{t.title}</h2>
      {rows.length === 0 ? (
        <p className="text-steel">{t.empty}</p>
      ) : (
        <>
          <svg
            role="img"
            viewBox={`0 0 ${vbW} ${vbH}`}
            width="100%"
            aria-labelledby="analitica-authors-title analitica-authors-desc"
          >
            <title id="analitica-authors-title">{t.title}</title>
            <desc id="analitica-authors-desc">{summary}</desc>
            {rows.map((r, i) => {
              const y = i * rowH;
              const barW = ((vbW - labelW - 8) * r.n) / max;
              const name = r.name ?? t.unnamed;
              return (
                <g key={r.authorId}>
                  <text x={0} y={y + 12}>{name}</text>
                  <rect x={labelW} y={y + 4} width={barW} height={10} fill="var(--accent)" />
                </g>
              );
            })}
          </svg>
          <p className="analitica-chart-summary">{summary}</p>
          <details className="analitica-data">
            <summary>{t.viewData}</summary>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>{t.person}</th>
                  <th>{t.count}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.authorId}>
                    <td data-label={t.person}>{r.name ?? t.unnamed}</td>
                    <td data-label={t.count} className="mono">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
