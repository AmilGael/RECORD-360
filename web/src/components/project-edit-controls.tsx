import { renameProjectForm, renameSegmentForm, renamePartidaForm, movePartidaForm } from "@/app/actions/project-edit";
import { SubmitButton } from "@/components/submit-button";
import { InlineActionForm } from "@/components/inline-action-form";
import { Pencil, MoveRight } from "@/components/icons";

type EditT = {
  rename: string;
  save: string;
  move: string;
  moveTo: string;
  ungrouped: string;
};

type SegmentOption = { id: string; name: string };

export function RenameProjectForm({ projectId, currentName, t }: { projectId: string; currentName: string; t: EditT }) {
  return (
    <details className="inline-edit">
      <summary><Pencil size={12} />{t.rename}</summary>
      <InlineActionForm action={renameProjectForm}>
        <input type="hidden" name="projectId" value={projectId} />
        <input name="name" defaultValue={currentName} required className="input" />
        <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
      </InlineActionForm>
    </details>
  );
}

export function RenameSegmentForm({ segmentId, currentName, t }: { segmentId: string; currentName: string; t: EditT }) {
  return (
    <details className="inline-edit tree-edit">
      <summary><Pencil size={11} />{t.rename}</summary>
      <InlineActionForm action={renameSegmentForm}>
        <input type="hidden" name="segmentId" value={segmentId} />
        <input name="name" defaultValue={currentName} required className="input" />
        <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
      </InlineActionForm>
    </details>
  );
}

export function RenamePartidaForm({ partidaId, currentName, t }: { partidaId: string; currentName: string; t: EditT }) {
  return (
    <details className="inline-edit tree-edit">
      <summary><Pencil size={11} />{t.rename}</summary>
      <InlineActionForm action={renamePartidaForm}>
        <input type="hidden" name="partidaId" value={partidaId} />
        <input name="name" defaultValue={currentName} required className="input" />
        <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
      </InlineActionForm>
    </details>
  );
}

export function MovePartidaForm({
  partidaId, currentSegmentId, segments, t,
}: {
  partidaId: string;
  currentSegmentId: string | null;
  segments: SegmentOption[];
  t: EditT;
}) {
  return (
    <details className="inline-edit tree-edit">
      <summary><MoveRight size={11} />{t.move}</summary>
      <InlineActionForm action={movePartidaForm}>
        <input type="hidden" name="partidaId" value={partidaId} />
        <select name="segmentId" defaultValue={currentSegmentId ?? ""} className="input" aria-label={t.moveTo}>
          <option value="">{t.ungrouped}</option>
          {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
      </InlineActionForm>
    </details>
  );
}
