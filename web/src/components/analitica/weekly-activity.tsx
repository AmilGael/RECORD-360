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
  const vbW = 360;
  const vbH = 148;
  const padL = 4;
  const padR = 4;
  const padT = 6;
  const padB = 36;
  const innerW = vbW - padL - padR;
  const innerH = vbH - padT - padB;
  const gap = 3;
  const barW = (innerW - gap * (weeks.length - 1)) / weeks.length;

  return (
    <section className="analitica-chart">
      <h2 className="kicker">{t.title}</h2>
      <svg
        role="img"
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        aria-labelledby="analitica-weekly-title analitica-weekly-desc"
      >
        <title id="analitica-weekly-title">{t.title}</title>
        <desc id="analitica-weekly-desc">{summary}</desc>
        {weeks.map((w, i) => {
          const h = (w.n / max) * innerH;
          const x = padL + i * (barW + gap);
          const y = padT + innerH - h;
          return (
            <g key={w.week}>
              <rect x={x} y={y} width={barW} height={Math.max(h, 0)} fill="var(--accent)" />
              <text
                x={x + barW / 2}
                y={vbH - 8}
                textAnchor="end"
                transform={`rotate(-55 ${x + barW / 2} ${vbH - 8})`}
              >
                {formatWeekLabel(w.week, lang)}
              </text>
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
