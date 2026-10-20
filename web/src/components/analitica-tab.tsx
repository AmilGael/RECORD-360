// WS6 (analytics neutralization): progress bars/indicators use ONE neutral
// accent color. `healthLevel`-derived red/yellow/green dots and phase labels
// are gone from every progress row — green is reserved for a partida that is
// actually concluded (lifecycle state), never inferred from hitting 100% by
// itself, and yellow/red are reserved for request severity elsewhere in the
// app (see cambios-list / cambios detail).
import Link from "next/link";
import { EntriesByAuthorChart } from "@/components/analitica/entries-by-author";
import { PartidaStatusChart, StatusStack } from "@/components/analitica/partida-status";
import { WeeklyActivityChart } from "@/components/analitica/weekly-activity";
import type { AuthorCount, OpenAlert, ProjectAnalytics } from "@/lib/analytics/project";
import { formatTimestamp } from "@/lib/format/datetime";
import { activityAging } from "@/lib/partida/aging";
import { projectProgress } from "@/lib/project/progress";
import type { Dict, Lang } from "@/i18n/dictionaries";

type PRow = { id: string; name: string; progressPct: number; completed?: boolean };
type BRow = {
  id: string;
  name: string;
  progress: number;
  closedAt: Date | string | null;
  partidas: PRow[];
};
type AnaliticaT = Dict["project"]["analitica"] & {
  general: string; byBloque: string; openChanges: string; overdue: string;
  partidasWord: string; noBloques: string; ungrouped: string;
  aging7: string; aging14: string; noActivity: string; blockClosed: string;
  severityImportant: string; severityCritical: string;
};

const VISIBLE_PARTIDAS = 8;

function fill(template: string, count: number) {
  return template.replace("{count}", String(count));
}

// `done` is passed explicitly rather than derived from `pct >= 100` — an
// aggregate (project-wide or per-bloque average) can only ever show the
// neutral accent, even at 100%, because "done" only has meaning for a single
// concluded partida (Partida.completedAt != null), not for an average.
function Bar({ pct, done }: { pct: number; done: boolean }) {
  return (
    <div className="progress-track" style={{ flex: 1, minWidth: 80 }}>
      <div className={`progress-fill${done ? " is-done" : ""}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Row({ name, pct, sub, done, small }: { name: string; pct: number; sub?: string; done?: boolean; small?: boolean }) {
  return (
    <div className="analitica-row">
      <span className="analitica-row-name">{name}{sub ? <span className="text-steel"> · {sub}</span> : null}</span>
      <Bar pct={pct} done={Boolean(done)} />
      <span className="analitica-pct mono" style={small ? { fontSize: "0.78rem" } : undefined}>{pct}%</span>
    </div>
  );
}

function bySegment<T extends { segmentId: string | null }>(rows: T[], segmentId: string | null): T | undefined {
  return rows.find((r) => r.segmentId === segmentId);
}

function PartidaList({ partidas, t }: { partidas: PRow[]; t: AnaliticaT }) {
  const visible = partidas.slice(0, VISIBLE_PARTIDAS);
  const rest = partidas.slice(VISIBLE_PARTIDAS);
  return (
    <div className="analitica-partida-list">
      {visible.map((p) => (
        <Row key={p.id} name={p.name} pct={p.progressPct} done={p.completed} small />
      ))}
      {rest.length > 0 && (
        <details className="analitica-partidas-more">
          <summary>{fill(t.viewPartidas, partidas.length)}</summary>
          {rest.map((p) => (
            <Row key={p.id} name={p.name} pct={p.progressPct} done={p.completed} small />
          ))}
        </details>
      )}
    </div>
  );
}

function BloquePlate({
  index, name, progress, closed, partidas, status, lastAt, photoPct, t, lang,
}: {
  index: number;
  name: string;
  progress: number;
  closed: boolean;
  partidas: PRow[];
  status: { notStarted: number; inProgress: number; concluded: number };
  lastAt: Date | null;
  photoPct: number;
  t: AnaliticaT;
  lang: Lang;
}) {
  const aging = activityAging(lastAt?.toISOString() ?? null);
  return (
    <article className="repo-card analitica-bloque">
      <span className="plate-index" aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <div className="analitica-bloque-body">
        <div className="repo-title">
          {name}
          {closed && <span className="state-badge is-archived">{t.blockClosed}</span>}
        </div>
        <div className="repo-meta">
          <span>{partidas.length} {t.partidasWord}</span>
          <span className="sep">·</span>
          <span className="progress-label">{progress}%</span>
          <span className="sep">·</span>
          <span>{t.photoCoverage} {photoPct}%</span>
        </div>
        <StatusStack
          notStarted={status.notStarted}
          inProgress={status.inProgress}
          concluded={status.concluded}
          t={t}
        />
        <div className="analitica-bloque-activity">
          <span className="mono">
            {t.lastActivity}: {lastAt ? formatTimestamp(lastAt, lang) : t.noActivity}
          </span>
          {aging && (
            <span className={`aging-mark is-${aging}`}>{aging === "14" ? t.aging14 : t.aging7}</span>
          )}
        </div>
        <PartidaList partidas={partidas} t={t} />
      </div>
      <span className="plate-band-track" aria-hidden="true" />
      <span className="plate-band" style={{ width: `${progress}%` }} aria-hidden="true" />
    </article>
  );
}

export function AnaliticaTab({
  projectId, general, bloques, ungrouped, analytics, lang, t,
}: {
  projectId: string;
  general: {
    progress: number; concluded: number; partidas: number;
    openCambios: number; criticalAlerts: number;
    overdueReminders: number; last7Days: number; photoPct: number;
  };
  bloques: BRow[];
  ungrouped: PRow[];
  analytics: ProjectAnalytics;
  lang: Lang;
  t: AnaliticaT;
}) {
  const statusRows: { id: string; name: string; notStarted: number; inProgress: number; concluded: number }[] = [
    ...bloques.map((b) => {
      const s = bySegment(analytics.status, b.id);
      return {
        id: b.id, name: b.name,
        notStarted: s?.notStarted ?? 0,
        inProgress: s?.inProgress ?? 0,
        concluded: s?.concluded ?? 0,
      };
    }),
    ...(ungrouped.length > 0 ? [{
      id: "sin-bloque",
      name: t.ungrouped,
      ...(bySegment(analytics.status, null) ?? { notStarted: 0, inProgress: 0, concluded: 0 }),
    }] : []),
  ];

  return (
    <div className="analitica-tab">
      <div className="analitica-cards">
        <div className="analitica-card">
          <strong>{general.progress}%</strong>
          <span>{t.general}</span>
        </div>
        <div className="analitica-card">
          <strong>{general.concluded} / {general.partidas}</strong>
          <span>{t.concluded}</span>
        </div>
        <div className="analitica-card">
          <strong>{general.openCambios}</strong>
          <span>{t.openChanges}</span>
          {general.criticalAlerts > 0 && (
            <span>{general.criticalAlerts} {t.criticalAlerts}</span>
          )}
        </div>
        <div className="analitica-card">
          <strong>{general.overdueReminders}</strong>
          <span>{t.overdue}</span>
        </div>
        <div className="analitica-card">
          <strong>{general.last7Days}</strong>
          <span>{t.last7Days}</span>
        </div>
        <div className="analitica-card">
          <strong>{general.photoPct}%</strong>
          <span>{t.photoCoverage}</span>
        </div>
      </div>

      <WeeklyActivityChart
        weeks={analytics.weekly.weeks}
        lang={lang}
        t={{ title: t.weeklyTitle, summary: t.weeklySummary, viewData: t.viewData, week: t.week, count: t.count }}
      />

      {statusRows.length > 0 && (
        <PartidaStatusChart
          rows={statusRows}
          t={{
            title: t.statusTitle, summary: t.statusSummary, viewData: t.viewData,
            notStarted: t.notStarted, inProgress: t.inProgress, concludedState: t.concludedState,
            bloque: t.bloque,
          }}
        />
      )}

      <div className="kicker" style={{ margin: "20px 0 8px" }}>{t.byBloque}</div>
      {bloques.length === 0 && ungrouped.length === 0 && <p className="text-steel">{t.noBloques}</p>}
      {bloques.map((b, i) => {
        const status = bySegment(analytics.status, b.id) ?? { notStarted: 0, inProgress: 0, concluded: 0 };
        const last = bySegment(analytics.lastActivity, b.id)?.lastAt ?? null;
        const photo = bySegment(analytics.photo.byBloque, b.id);
        return (
          <BloquePlate
            key={b.id}
            index={i + 1}
            name={b.name}
            progress={b.progress}
            closed={Boolean(b.closedAt)}
            partidas={b.partidas}
            status={status}
            lastAt={last}
            photoPct={photo?.pct ?? 0}
            t={t}
            lang={lang}
          />
        );
      })}
      {ungrouped.length > 0 && (
        <BloquePlate
          index={bloques.length + 1}
          name={t.ungrouped}
          progress={projectProgress(ungrouped)}
          closed={false}
          partidas={ungrouped}
          status={bySegment(analytics.status, null) ?? { notStarted: 0, inProgress: 0, concluded: 0 }}
          lastAt={bySegment(analytics.lastActivity, null)?.lastAt ?? null}
          photoPct={bySegment(analytics.photo.byBloque, null)?.pct ?? 0}
          t={t}
          lang={lang}
        />
      )}

      <section className="analitica-alerts">
        <h2 className="kicker">{t.alertsTitle}</h2>
        {analytics.requests.openAlerts.length === 0 ? (
          <p className="text-steel">{t.alertsEmpty}</p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>{t.code}</th>
                <th>{t.title}</th>
                <th>{t.severity}</th>
                <th>{t.daysOpen}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.requests.openAlerts.map((a: OpenAlert) => (
                <tr key={a.id}>
                  <td data-label={t.code} className="mono">
                    <Link href={`/app/projects/${projectId}/cambios/${a.id}`}>{a.code}</Link>
                  </td>
                  <td data-label={t.title}>
                    <Link href={`/app/projects/${projectId}/cambios/${a.id}`}>{a.title}</Link>
                  </td>
                  <td data-label={t.severity}>
                    <span className={`severity-chip ${a.severity === "CRITICAL" ? "is-critical" : "is-important"}`}>
                      {a.severity === "CRITICAL" ? t.severityCritical : t.severityImportant}
                    </span>
                  </td>
                  <td data-label={t.daysOpen} className="mono">{a.daysOpen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <EntriesByAuthorChart
        rows={analytics.authors as AuthorCount[]}
        t={{
          title: t.authorsTitle, summary: t.authorsSummary, viewData: t.viewData,
          empty: t.authorsEmpty, person: t.person, count: t.count, unnamed: t.unnamed,
        }}
      />
    </div>
  );
}
