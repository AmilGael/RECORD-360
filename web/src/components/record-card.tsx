import type { Registro } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

type RecordT = { noGps: string; immutable: string };

export function RecordCard({ r, t, lang }: { r: Registro; t: RecordT; lang: Lang }) {
  const ts = formatTimestamp(r.serverCreatedAt, lang);
  const gps =
    r.gpsLat !== null && r.gpsLng !== null
      ? `${Number(r.gpsLat).toFixed(4)} · ${Number(r.gpsLng).toFixed(4)}`
      : t.noGps;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>{r.type}</span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{ts}</span>
      </div>
      <div style={{ padding: 14 }}>
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.mediaUrl} alt="" style={{ maxWidth: "100%", borderRadius: 3, display: "block" }} />
        )}
        <div className="mono text-steel" style={{ fontSize: 11, marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · ✓ {t.immutable}
        </div>
      </div>
    </div>
  );
}
