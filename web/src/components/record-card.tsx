import type { Registro } from "@prisma/client";

export function RecordCard({ r }: { r: Registro }) {
  const ts = r.serverCreatedAt.toISOString();
  const gps = r.gpsLat !== null && r.gpsLng !== null ? `${Number(r.gpsLat).toFixed(4)} · ${Number(r.gpsLng).toFixed(4)}` : "sin GPS";
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, marginBottom: 14, background: "var(--paper-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 11 }}>{r.type}</span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{ts}</span>
      </div>
      <div style={{ padding: 14 }}>
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.mediaUrl} alt="" style={{ maxWidth: "100%", borderRadius: 3 }} />
        )}
        <div className="mono" style={{ fontSize: 11, color: "var(--steel)", marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · ✓ inalterable
        </div>
      </div>
    </div>
  );
}
