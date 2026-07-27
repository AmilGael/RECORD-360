// WS6 (analytics neutralization): progress bars/indicators use ONE neutral
// accent color. `healthLevel`-derived red/yellow/green dots and phase labels
// are gone from every progress row — green is reserved for a partida that is
// actually concluded (lifecycle state), never inferred from hitting 100% by
// itself, and yellow/red are reserved for request severity elsewhere in the
// app (see cambios-list / cambios detail).
type PRow = { id: string; name: string; progressPct: number; completed?: boolean };
type BRow = { id: string; name: string; progress: number; partidas: PRow[] };
type AnaliticaT = {
  general: string; byBloque: string; openChanges: string; overdue: string;
  partidasWord: string; noBloques: string;
};

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

function Row({ name, pct, sub, done, small }: { name: string; pct: number; sub?: string; done?: boolean; small?: boolean }) {
  return (
    <div className="analitica-row">
      <span className="analitica-row-name">{name}{sub ? <span className="text-steel"> · {sub}</span> : null}</span>
      <Bar pct={pct} done={Boolean(done)} />
      <span className="analitica-pct mono" style={small ? { fontSize: "0.78rem" } : undefined}>{pct}%</span>
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
            <Row name={b.name} pct={b.progress} sub={`${b.partidas.length} ${t.partidasWord}`} />
            <div style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {b.partidas.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} done={p.completed} small />)}
            </div>
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ungrouped.map((p) => <Row key={p.id} name={p.name} pct={p.progressPct} done={p.completed} small />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
