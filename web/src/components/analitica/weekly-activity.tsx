import type { WeekCount } from "@/lib/analytics/project";
import { formatWeekLabel } from "@/lib/analytics/weeks";
import type { Lang } from "@/i18n/dictionaries";

function fill(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export function WeeklyActivityChart({ weeks, lang, t }: {
  weeks: WeekCount[];
  lang: Lang;
  t: { title: string; summary: string; viewData: string; week: string; count: string };
}) {
  const total = weeks.reduce((s, w) => s + w.n, 0);
  const max = Math.max(...weeks.map((w) => w.n), 1);
  const summary = fill(t.summary, total);
  // Bars only. The SVG stretches to the container at a fixed CSS height
  // (preserveAspectRatio="none"), so nothing in it may be text: viewBox text
  // would scale with the width and the rotated labels used to overflow the
  // bottom edge. Week labels are HTML in a matching 12-column grid below.
  const vbW = 360;
  const vbH = 100;
  const gap = 3;
  const barW = (vbW - gap * (weeks.length - 1)) / weeks.length;

  return (
    <section className="analitica-chart">
      <h2 className="kicker">{t.title}</h2>
      <div role="img" aria-labelledby="analitica-weekly-title analitica-weekly-desc">
        <span id="analitica-weekly-title" hidden>{t.title}</span>
        <span id="analitica-weekly-desc" hidden>{summary}</span>
        <svg
          className="analitica-weekly-bars"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {weeks.map((w, i) => {
            const h = (w.n / max) * vbH;
            return <rect key={w.week} x={i * (barW + gap)} y={vbH - h} width={barW} height={Math.max(h, 0)} fill="var(--accent)" />;
          })}
        </svg>
        <div className="analitica-weekly-labels" aria-hidden="true">
          {weeks.map((w) => <span key={w.week}>{formatWeekLabel(w.week, lang)}</span>)}
        </div>
      </div>
      <p className="analitica-chart-summary">{summary}</p>
      <details className="analitica-data">
        <summary>{t.viewData}</summary>
        <table className="dash-table">
          <thead>
            <tr>
              <th>{t.week}</th>
              <th>{t.count}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td data-label={t.week}>{formatWeekLabel(w.week, lang)}</td>
                <td data-label={t.count} className="mono">{w.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
