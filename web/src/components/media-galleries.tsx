import Link from "next/link";
import { FileText, Mic } from "@/components/icons";

export type MediaItem = { id: string; url: string; label: string; date: string; kind: "image" | "video" | "pdf" | "audio" | "doc" };

type T = { mediaTitle: string; mediaFotos: string; mediaVideos: string; mediaDocumentos: string; mediaAudio: string; mediaEmpty: string; older: string; newer: string };

const TABS = ["fotos", "videos", "documentos", "audio"] as const;
export type MediaTab = (typeof TABS)[number];
export function isMediaTab(v: string): v is MediaTab {
  return (TABS as readonly string[]).includes(v);
}

export function MediaGalleries({ projectId, tab, items, page, hasMore, t }: {
  projectId: string;
  tab: MediaTab;
  items: MediaItem[];
  page: number;
  hasMore: boolean;
  t: T;
}) {
  const labels: Record<MediaTab, string> = { fotos: t.mediaFotos, videos: t.mediaVideos, documentos: t.mediaDocumentos, audio: t.mediaAudio };
  const href = (mt: MediaTab, p = 1) => `/app/projects/${projectId}?media=${mt}${p > 1 ? `&mpage=${p}` : ""}`;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>{t.mediaTitle}</div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {TABS.map((mt) => (
          <Link key={mt} href={href(mt)} className={`tab ${tab === mt ? "is-on" : ""}`}>{labels[mt]}</Link>
        ))}
      </div>
      {items.length === 0 && <div className="repo-list-empty">{t.mediaEmpty}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {items.map((m) => (
          <a key={`${m.kind}-${m.id}`} href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
            {m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.label} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block" }} />
            ) : m.kind === "video" ? (
              <video src={m.url} preload="metadata" muted style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block", background: "#000" }} />
            ) : (
              <div className="card" style={{ aspectRatio: "1", display: "grid", placeItems: "center", padding: 8 }}>
                {m.kind === "audio" ? <Mic size={22} /> : <FileText size={22} />}
              </div>
            )}
            <div className="mono text-steel" style={{ fontSize: "0.62rem", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.label} · {m.date}
            </div>
          </a>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {page > 1 && <Link href={href(tab, page - 1)} className="btn btn-ghost" style={{ fontSize: "0.76rem" }}>{t.newer}</Link>}
        {hasMore && <Link href={href(tab, page + 1)} className="btn btn-ghost" style={{ fontSize: "0.76rem" }}>{t.older}</Link>}
      </div>
    </div>
  );
}
