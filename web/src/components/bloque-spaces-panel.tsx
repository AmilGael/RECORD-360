import Link from "next/link";
import type { AttachmentType, Document, DocumentKind, Registro } from "@prisma/client";
import type { Lang } from "@/i18n/dictionaries";
import { formatTimestamp } from "@/lib/format/datetime";
import { PlanosUpload } from "@/components/planos-upload";

type SegmentSummary = { id: string; name: string; progress: number; count: number };
type SpaceKey = "cuaderno" | "planos" | "actualizados" | "levantamientos" | "ideas" | "media" | "recordatorios" | "indicadores";
type MediaItem = { id: string; url: string; fileType: AttachmentType; text: string | null; createdAt: Date };
type NoteItem = Pick<Registro, "id" | "text" | "serverCreatedAt" | "hash" | "partidaId"> & { partidaName: string };

const SPACES: { key: SpaceKey; label: string; kind?: DocumentKind }[] = [
  { key: "cuaderno", label: "Cuaderno" },
  { key: "planos", label: "Planos", kind: "PLANO" },
  { key: "actualizados", label: "Planos actualizados", kind: "PLANO_ACTUALIZADO" },
  { key: "levantamientos", label: "Levantamientos", kind: "LEVANTAMIENTO" },
  { key: "ideas", label: "Ideas", kind: "IDEA" },
  { key: "media", label: "Media" },
  { key: "recordatorios", label: "Recordatorios" },
  { key: "indicadores", label: "Indicadores" },
];

function href(projectId: string, segmentId: string, space: SpaceKey) {
  return `/app/projects/${projectId}?tab=code&spaceBlock=${segmentId}&space=${space}`;
}

export function BloqueSpacesPanel({
  projectId, segments, selectedSegmentId, selectedSpace, docs, notes, media, reminders, overdueCount, noReminderCount, canUpload, lang, t,
}: {
  projectId: string;
  segments: SegmentSummary[];
  selectedSegmentId: string | null;
  selectedSpace: SpaceKey;
  docs: Document[];
  notes: NoteItem[];
  media: MediaItem[];
  reminders: NoteItem[];
  overdueCount: number;
  noReminderCount: number;
  canUpload: boolean;
  lang: Lang;
  t: { emptyDocs: string; upload: string; title: string; error: string; uploadedBy: string; view: string };
}) {
  if (segments.length === 0 || !selectedSegmentId) return null;
  const selected = segments.find((s) => s.id === selectedSegmentId) ?? segments[0];
  const space = SPACES.find((s) => s.key === selectedSpace) ?? SPACES[0];
  const grouped = media.reduce<Record<AttachmentType, MediaItem[]>>((acc, item) => {
    acc[item.fileType] ??= [];
    acc[item.fileType].push(item);
    return acc;
  }, { IMAGE: [], VIDEO: [], PDF: [], AUDIO: [] });

  return (
    <section className="space-panel">
      <aside className="space-nav" aria-label="Bloque spaces">
        <div className="space-nav-title">Bloques</div>
        {segments.map((s) => (
          <Link key={s.id} href={href(projectId, s.id, selectedSpace)} className={`space-block${s.id === selected.id ? " is-on" : ""}`}>
            <span>{s.name}</span>
            <span>{s.progress}%</span>
          </Link>
        ))}
        <div className="space-nav-title">Espacios</div>
        {SPACES.map((s) => (
          <Link key={s.key} href={href(projectId, selected.id, s.key)} className={`space-link${s.key === selectedSpace ? " is-on" : ""}`}>{s.label}</Link>
        ))}
      </aside>
      <div className="space-main">
        <div className="space-head">
          <div>
            <div className="mono text-steel" style={{ fontSize: 11 }}>Obra / Bloque / {space.label}</div>
            <h2 className="h-md">{selected.name}</h2>
          </div>
          <div className="space-meter"><span>{selected.progress}%</span><small>{selected.count} partidas</small></div>
        </div>

        {space.kind && (
          <>
            {canUpload && <PlanosUpload projectId={projectId} segmentId={selected.id} kind={space.kind} t={{ upload: t.upload, title: t.title, error: t.error }} />}
            <DocList docs={docs} lang={lang} t={t} />
          </>
        )}
        {space.key === "cuaderno" && <NotesList notes={notes} lang={lang} />}
        {space.key === "media" && <MediaGroups grouped={grouped} />}
        {space.key === "recordatorios" && <NotesList notes={reminders} lang={lang} empty="Sin recordatorios vencidos o próximos." />}
        {space.key === "indicadores" && (
          <div className="indicator-grid">
            <div><strong>{selected.progress}%</strong><span>Avance medio</span></div>
            <div><strong>{selected.count}</strong><span>Partidas activas</span></div>
            <div><strong>{notes.length}</strong><span>Registros recientes</span></div>
            <div><strong>{overdueCount}</strong><span>Recordatorios vencidos</span></div>
            <div><strong>{noReminderCount}</strong><span>Registros sin recordatorio</span></div>
          </div>
        )}
      </div>
    </section>
  );
}

function DocList({ docs, lang, t }: { docs: Document[]; lang: Lang; t: { emptyDocs: string; uploadedBy: string; view: string } }) {
  return (
    <div className="repo-list">
      {docs.length === 0 && <div className="repo-list-empty">{t.emptyDocs}</div>}
      {docs.map((d) => (
        <div key={d.id} className="cr-row" style={{ justifyContent: "space-between" }}>
          <span className="cr-main">
            <span className="cr-title">{d.title || d.url.split("/").pop()}</span>
            <span className="cr-meta">{formatTimestamp(d.createdAt, lang)}</span>
          </span>
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", whiteSpace: "nowrap" }}>
            {t.view}
          </a>
        </div>
      ))}
    </div>
  );
}

function NotesList({ notes, lang, empty = "Sin registros en este bloque." }: { notes: NoteItem[]; lang: Lang; empty?: string }) {
  return (
    <div className="repo-list">
      {notes.length === 0 && <div className="repo-list-empty">{empty}</div>}
      {notes.map((n) => (
        <Link key={n.id} href={`/app/partidas/${n.partidaId}`} className="cr-row">
          <span className="cr-main">
            <span className="cr-title">{n.partidaName}</span>
            <span className="cr-meta">{formatTimestamp(n.serverCreatedAt, lang)} · HASH {n.hash.slice(0, 8)}…</span>
            <span style={{ display: "block", marginTop: 5 }}>{n.text ?? "Registro sin texto"}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function MediaGroups({ grouped }: { grouped: Record<AttachmentType, MediaItem[]> }) {
  return (
    <div className="media-groups">
      {(["IMAGE", "VIDEO", "AUDIO", "PDF"] as AttachmentType[]).map((kind) => (
        <div key={kind} className="media-group">
          <div className="media-group-head">{kind}</div>
          {grouped[kind].length === 0 ? <span className="text-steel">Sin archivos.</span> : grouped[kind].map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">{m.text || m.url.split("/").pop()}</a>
          ))}
        </div>
      ))}
    </div>
  );
}

export type { SpaceKey };
