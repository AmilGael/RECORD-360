import { healthLevel } from "@/lib/project/health";

type PRow = { id: string; name: string; progressPct: number };
type BRow = { id: string; name: string; progress: number; partidas: PRow[] };
type AnaliticaT = {
  general: string; byBloque: string; openChanges: string; overdue: string;
  partidasWord: string; noBloques: string;
  phaseRed: string; phaseYellow: string; phaseGreen: string;
};

const phaseLabel = (level: string, t: { phaseRed: string; phaseYellow: string; phaseGreen: string }) =>
  level === "green" ? t.phaseGreen : level === "yellow" ? t.phaseYellow : t.phaseRed;

function Bar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden", flex: 1, minWidth: 80 }}>
      <i style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

function Row({ name, pct, sub, phaseT, small }: { name: string; pct: number; sub?: string; phaseT?: { phaseRed: string; phaseYellow: string; phaseGreen: string }; small?: boolean }) {
  const level = healthLevel(pct);
  return (
    <div className="analitica-row">
      <span className={`health-dot ${level}`} aria-hidden="true" />
      {phaseT && <span className="mono text-steel" style={{ fontSize: small ? "0.62rem" : "0.7rem" }}>{phaseLabel(level, phaseT)}</span>}
      <span className="analitica-row-name">{name}{sub ? <span className="text-steel"> · {sub}</span> : null}</span>
      <Bar pct={pct} />
      <span className="analitica-pct mono">{pct}%</span>
    </div>
  );
}

export function AnaliticaTab({ general, bloques, ungrouped, t }: {
  general: { progress: number; partidas: number; openCambios: number; overdueReminders: number };
  bloques: BRow[];
  ungrouped: PRow[];
  t: AnaliticaT;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="analitica-cards">
        <div className="analitica-card">
          <span className={`health-dot ${healthLevel(general.progress)}`} aria-hidden="true" />
          <span className="mono text-steel" style={{ fontSize: "0.7rem" }}>{phaseLabel(healthLevel(general.progress), t)}</span>
          <strong>{general.progress}%</strong><span>{t.general}</span>
        </div>
        <div className="analitica-card"><strong>{general.partidas}</strong><span>{t.partidasWord}</span></div>
        <div className="analitica-card"><strong>{general.openCambios}</strong><span>{t.openChanges}</span></div>
        <div className="analitica-card"><strong>{general.overdueReminders}</strong><span>{t.overdue}</span></div>
      </div>

      <div className="kicker" style={{ margin: "20px 0 8px" }}>{t.byBloque}</div>
      {bloques.length === 0 && ungrouped.length === 0 && <p className="text-steel">{t.noBloques}</p>}
      <div className="repo-list">
        {bloques.map((b) => (
          <div key={b.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <Row name={b.name} pct={b.progress} sub={`${b.partidas.length} ${t.partidasWord}`} phaseT={t} />
            <div style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {b.partidas.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} phaseT={t} small />)}
            </div>
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ungrouped.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} phaseT={t} small />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
