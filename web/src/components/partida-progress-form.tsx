import { updatePartidaProgress } from "@/app/actions/partida-progress";
import { SubmitButton } from "@/components/submit-button";

export function PartidaProgressForm({
  partidaId, progressPct, canEdit, t,
}: {
  partidaId: string;
  progressPct: number;
  canEdit: boolean;
  t: { progress: string; save: string };
}) {
  if (!canEdit) {
    return <div className="mono text-steel" style={{ fontSize: "0.8rem" }}>{t.progress} {progressPct}%</div>;
  }
  return (
    <form action={updatePartidaProgress} className="progress-edit">
      <input type="hidden" name="partidaId" value={partidaId} />
      <label className="form-label" htmlFor={`progress-${partidaId}`}>{t.progress}</label>
      {/* max 99: reaching 100 requires Concluir (WS4C) — mirrors the server cap
          in updatePartidaProgress so the client can't offer a value the server
          will reject. */}
      <input id={`progress-${partidaId}`} type="number" name="progressPct" min={0} max={99} step={1} defaultValue={Math.min(progressPct, 99)} className="input" />
      <SubmitButton className="btn btn-ghost">{t.save}</SubmitButton>
    </form>
  );
}
