function fill(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export type StatusCounts = { notStarted: number; inProgress: number; concluded: number };

export type StatusRow = StatusCounts & { id: string; name: string };

type StatusT = {
  title: string;
  summary: string;
  viewData: string;
  notStarted: string;
  inProgress: string;
  concludedState: string;
  bloque: string;
};

const TRACK = 200;
const H = 10;

export function StatusStack({ notStarted, inProgress, concluded, t }: StatusCounts & {
  t: Pick<StatusT, "notStarted" | "inProgress" | "concludedState">;
}) {
  const total = notStarted + inProgress + concluded;
  const segs = [
    { n: notStarted, fill: "var(--paper-3)", label: t.notStarted, cls: "is-idle" },
    { n: inProgress, fill: "var(--accent)", label: t.inProgress, cls: "is-active" },
    { n: concluded, fill: "var(--state-active)", label: t.concludedState, cls: "is-done" },
  ];
  let x = 0;
  const rects = [];
  for (const s of segs) {
    if (s.n === 0 || total === 0) continue;
    const w = (s.n / total) * TRACK;
    rects.push(
      <rect key={s.cls} x={x} y={0} width={w} height={H} fill={s.fill}>
        <title>{`${s.label}: ${s.n}`}</title>
      </rect>,
    );
    x += w;
  }
  return (
    <svg className="analitica-stack" viewBox={`0 0 ${TRACK} ${H}`} width="100%" height={H} aria-hidden="true">
      <rect x={0} y={0} width={TRACK} height={H} fill="color-mix(in srgb, var(--ink) 12%, transparent)" />
      {rects}
    </svg>
  );
}

export function PartidaStatusChart({ rows, t }: { rows: StatusRow[]; t: StatusT }) {
  const total = rows.reduce((s, r) => s + r.notStarted + r.inProgress + r.concluded, 0);
  const summary = fill(t.summary, total);
  return (
    <section className="analitica-chart">
      <h2 className="kicker">{t.title}</h2>
      <div
        role="img"
        aria-labelledby="analitica-status-title analitica-status-desc"
        className="analitica-status-rows"
      >
        <span id="analitica-status-title" hidden>{t.title}</span>
        <span id="analitica-status-desc" hidden>{summary}</span>
        {rows.map((r) => (
          <div key={r.id} className="analitica-status-row">
            <span className="analitica-status-name">{r.name}</span>
            <StatusStack notStarted={r.notStarted} inProgress={r.inProgress} concluded={r.concluded} t={t} />
          </div>
        ))}
      </div>
      <ul className="analitica-legend">
        <li><i className="analitica-swatch is-idle" aria-hidden="true" />{t.notStarted}</li>
        <li><i className="analitica-swatch is-active" aria-hidden="true" />{t.inProgress}</li>
        <li><i className="analitica-swatch is-done" aria-hidden="true" />{t.concludedState}</li>
      </ul>
      <p className="analitica-chart-summary">{summary}</p>
      <details className="analitica-data">
        <summary>{t.viewData}</summary>
        <table className="dash-table">
          <thead>
            <tr>
              <th>{t.bloque}</th>
              <th>{t.notStarted}</th>
              <th>{t.inProgress}</th>
              <th>{t.concludedState}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label={t.bloque}>{r.name}</td>
                <td data-label={t.notStarted} className="mono">{r.notStarted}</td>
                <td data-label={t.inProgress} className="mono">{r.inProgress}</td>
                <td data-label={t.concludedState} className="mono">{r.concluded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
