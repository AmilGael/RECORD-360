import Link from "next/link";
import type { Registro, Attachment, Location } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import { Pin } from "@/components/icons";
import { PartidaProgressForm } from "@/components/partida-progress-form";

type SummaryT = { noEntries: string; lastUpdate: string; openLog: string; progress: string; save: string };
type RegistroRow = Registro & { attachments: Attachment[]; location: Location | null };

export function PartidaSummary({
  partida, authorName, lang, canEdit, t,
}: {
  partida: { id: string; name: string; progressPct: number; registros: RegistroRow[] };
  authorName: string | null;
  lang: Lang;
  canEdit: boolean;
  t: SummaryT;
}) {
  const latest = partida.registros[0];
  return (
    <div className="viewport">
      {latest && (
        <div className="telemetry" style={{ marginBottom: 10 }}>
          {t.lastUpdate} · {authorName ?? "—"} · {formatTimestamp(latest.serverCreatedAt, lang)} · {latest.hash.slice(0, 8)}…{latest.hash.slice(-4)}
        </div>
      )}
      <h2 className="h-md" style={{ fontSize: "1.4rem", marginBottom: 6 }}>{partida.name}</h2>
      <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden", maxWidth: 280, marginBottom: 14 }}>
        <i style={{ display: "block", height: "100%", width: `${partida.progressPct}%`, background: "var(--accent)" }} />
      </div>
      <PartidaProgressForm partidaId={partida.id} progressPct={partida.progressPct} canEdit={canEdit} t={{ progress: t.progress, save: t.save }} />
      {partida.registros.length === 0 && <p className="text-steel" style={{ fontSize: "0.88rem" }}>{t.noEntries}</p>}
      {partida.registros.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "9px 11px", marginBottom: 8, background: "var(--paper-2)" }}>
          <div className="mono text-steel" style={{ fontSize: "0.62rem", display: "flex", gap: 7, marginBottom: 4 }}>
            {r.category && <span>{r.category}</span>}
            {r.location && <span><Pin size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{r.location.label}</span>}
            <span>{formatTimestamp(r.serverCreatedAt, lang)}</span>
          </div>
          {r.text && <p style={{ fontSize: "0.88rem" }}>{r.text}</p>}
        </div>
      ))}
      <Link href={`/app/partidas/${partida.id}`} className="btn btn-ink" style={{ marginTop: 8, padding: "0.5rem 0.9rem", fontSize: "0.82rem" }}>
        {t.openLog} →
      </Link>
    </div>
  );
}
