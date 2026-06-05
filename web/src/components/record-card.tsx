import type { Registro, Attachment, Location } from "@prisma/client";
import { formatTimestamp } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";
import Link from "next/link";
import { Pin, Check } from "@/components/icons";

type RecordT = { noGps: string; immutable: string; correct?: string; by?: string; document?: string };
type RegistroWithRelations = Registro & { attachments: Attachment[]; location: Location | null };

function Media({ a, t }: { a: Attachment; t: RecordT }) {
  const s = { width: "100%", borderRadius: "var(--radius-sm)", display: "block" } as const;
  if (a.fileType === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt="" style={s} />;
  }
  if (a.fileType === "VIDEO") return <video src={a.url} controls style={s} />;
  if (a.fileType === "AUDIO") return <audio src={a.url} controls style={{ width: "100%" }} />;
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px" }}>
      {t.document ?? "Document"}
    </a>
  );
}

export function RecordCard({
  r, t, lang, authorName, correctionHref,
}: {
  r: RegistroWithRelations;
  t: RecordT;
  lang: Lang;
  authorName?: string | null;
  correctionHref?: string;
}) {
  const ts = formatTimestamp(r.serverCreatedAt, lang);
  const gps =
    r.gpsLat !== null && r.gpsLng !== null
      ? `${Number(r.gpsLat).toFixed(4)} · ${Number(r.gpsLng).toFixed(4)}`
      : t.noGps;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--ink)", color: "var(--paper)" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>{r.category ?? "REGISTRO"}</span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{ts}</span>
      </div>
      <div style={{ padding: 14 }}>
        {authorName && (
          <div className="mono text-steel" style={{ fontSize: 11, marginBottom: 8 }}>{t.by ?? "by"} {authorName}</div>
        )}
        {r.location && (
          <div className="mono text-steel" style={{ fontSize: 11, marginBottom: 8 }}><Pin size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{r.location.label}</div>
        )}
        {r.text && <p style={{ marginBottom: 8 }}>{r.text}</p>}
        {r.attachments.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginTop: 4 }}>
            {r.attachments.map((a) => <Media key={a.id} a={a} t={t} />)}
          </div>
        )}
        <div className="mono text-steel" style={{ fontSize: 11, marginTop: 10 }}>
          GPS {gps} · HASH {r.hash.slice(0, 8)}…{r.hash.slice(-4)} · <Check size={11} style={{ verticalAlign: -1, marginRight: 2 }} />{t.immutable}
        </div>
        {correctionHref && (
          <Link href={correctionHref} className="mono" style={{ display: "inline-flex", marginTop: 8, fontSize: 11, color: "var(--accent-deep)", textDecoration: "none" }}>
            {t.correct ?? "Correct"}
          </Link>
        )}
      </div>
    </div>
  );
}
