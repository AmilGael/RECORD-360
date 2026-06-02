import Link from "next/link";
import { createPartida, createSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type PartidaRow = { id: string; name: string; progressPct: number };
type TreeT = {
  ungrouped: string; newPartida: string; add: string;
  segmentPlaceholder: string; newSegment: string; addSegment: string;
};

function FileRow({ projectId, pa, selectedId }: { projectId: string; pa: PartidaRow; selectedId?: string }) {
  return (
    <Link
      href={`/app/projects/${projectId}?p=${pa.id}`}
      className={`tree-file${pa.id === selectedId ? " is-active" : ""}`}
    >
      <span>{pa.name}</span>
      <span className="pct">{pa.progressPct}%</span>
    </Link>
  );
}

export function ProjectFileTree({
  projectId, segments, ungrouped, segmentNames, selectedId, t,
}: {
  projectId: string;
  segments: { id: string; name: string; partidas: PartidaRow[] }[];
  ungrouped: PartidaRow[];
  segmentNames: string[];
  selectedId?: string;
  t: TreeT;
}) {
  return (
    <div className="tree">
      {segments.map((s) => (
        <div key={s.id}>
          <div className="tree-folder">📂 {s.name}</div>
          {s.partidas.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} />)}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <div className="tree-folder" style={{ opacity: 0.7 }}>▢ {t.ungrouped}</div>
          {ungrouped.map((pa) => <FileRow key={pa.id} projectId={projectId} pa={pa} selectedId={selectedId} />)}
        </div>
      )}
      <div className="tree-actions">
        <form action={createPartida} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="hidden" name="projectId" value={projectId} />
          <input name="name" placeholder={t.newPartida} required className="input" />
          <input name="segment" list="segment-options" placeholder={t.segmentPlaceholder} className="input" />
          <datalist id="segment-options">
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
    </div>
  );
}
