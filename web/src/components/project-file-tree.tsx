import Link from "next/link";
import { createPartida, createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Folder } from "@/components/icons";
import { MovePartidaForm, RenamePartidaForm, RenameSegmentForm } from "@/components/project-edit-controls";

type PartidaRow = { id: string; name: string; progressPct: number; segmentId?: string | null };
type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
  rename: string; save: string; move: string; moveTo: string;
};

type SegmentOption = { id: string; name: string };

function FileRow({
  projectId, pa, selectedId, isAdmin, segments, t,
}: {
  projectId: string;
  pa: PartidaRow;
  selectedId?: string;
  isAdmin: boolean;
  segments: SegmentOption[];
  t: TreeT;
}) {
  return (
    <div className={`tree-row${pa.id === selectedId ? " is-active" : ""}`}>
      <Link
        href={`/app/projects/${projectId}?p=${pa.id}`}
        className="tree-file"
        aria-label={`${pa.name} — ${pa.progressPct}%`}
      >
        <span>{pa.name}</span>
        <span className="pct">{pa.progressPct}%</span>
      </Link>
      {isAdmin && (
        <div className="tree-row-actions">
          <RenamePartidaForm partidaId={pa.id} currentName={pa.name} t={t} />
          <MovePartidaForm partidaId={pa.id} currentSegmentId={pa.segmentId ?? null} segments={segments} t={t} />
        </div>
      )}
    </div>
  );
}

export function ProjectFileTree({
  projectId, segments, ungrouped, segmentNames, selectedId, isAdmin, t,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaRow[] }[];
  ungrouped: PartidaRow[];
  segmentNames: string[];
  selectedId?: string;
  isAdmin: boolean;
  t: TreeT;
}) {
  const segListId = `segment-opts-${projectId}`;
  const segmentOptions = segments.map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="tree">
      {segments.map((s) => (
        <div key={s.id}>
          <div className="tree-folder">
            <span><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{s.name}</span>
            {isAdmin && <RenameSegmentForm segmentId={s.id} currentName={s.name} t={t} />}
          </div>
          {s.partidas.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} isAdmin={isAdmin} segments={segmentOptions} t={t} />)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <div className="tree-folder" style={{ opacity: 0.7 }}><Folder size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{t.ungrouped}</div>
          {ungrouped.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} isAdmin={isAdmin} segments={segmentOptions} t={t} />)}
        </div>
      )}
      {isAdmin && (
        <div className="tree-actions">
          <form action={createPartida} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder={t.newPartida} required className="input" />
            <input name="segment" list={segListId} placeholder={t.segmentPlaceholder} className="input" />
            <datalist id={segListId}>
              {segmentNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <SubmitButton className="btn btn-accent" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>{t.add}</SubmitButton>
          </form>
          <form action={createSegment} style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder={t.newSegment} required className="input" style={{ flex: 1 }} />
            <SubmitButton className="btn btn-ghost" style={{ padding: "0.5rem 0.7rem", fontSize: "0.78rem" }}>{t.addSegment}</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
