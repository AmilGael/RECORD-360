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

  // HTML rows, not SVG text: names keep the app's type size at every width
  // and truncate (full name on hover) instead of running into the bars.
  return (
    <section className="analitica-chart">
      <h2 className="kicker">{t.title}</h2>
      {rows.length === 0 ? (
        <p className="text-steel">{t.empty}</p>
      ) : (
        <>
          <div role="img" aria-labelledby="analitica-authors-title analitica-authors-desc" className="analitica-author-rows">
            <span id="analitica-authors-title" hidden>{t.title}</span>
            <span id="analitica-authors-desc" hidden>{summary}</span>
            {rows.map((r) => {
              const name = r.name ?? t.unnamed;
              return (
                <div key={r.authorId} className="analitica-author-row">
                  <span className="analitica-author-name" title={name}>{name}</span>
                  <span className="analitica-author-track" aria-hidden="true">
                    <i style={{ width: `${(r.n / max) * 100}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
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
