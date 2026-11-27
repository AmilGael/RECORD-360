import { renameProjectForm, renameSegmentForm } from "@/app/actions/project-edit";
import { SubmitButton } from "@/components/submit-button";
import { InlineActionForm } from "@/components/inline-action-form";
import { Pencil } from "@/components/icons";

type EditT = {
  rename: string;
  save: string;
  move: string;
  moveTo: string;
  ungrouped: string;
};

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
