"use client";
import { createPartida, createSegment } from "@/app/actions/admin";
import { CreateSheet } from "@/components/create-sheet";
import { SubmitButton } from "@/components/submit-button";
import { Plus } from "@/components/icons";

// Both actions are unchanged: they throw on failure, as they did when the forms
// posted to them directly, and the sheet closes only once they return.

/** "Nuevo bloque" on the obra overview. */
export function NewBloqueSheet({ projectId, t }: {
  projectId: string;
  t: { newBloque: string; newSegment: string; add: string; close: string };
}) {
  return (
    <CreateSheet
      label={t.newBloque}
      closeLabel={t.close}
      triggerClassName="card new-bloque-trigger"
      triggerIcon={<Plus size={12} />}
    >
      {(close) => (
        <form
          action={async (fd) => {
            await createSegment(fd);
            close();
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input name="name" required placeholder={t.newSegment} className="input" />
          <SubmitButton className="btn btn-accent" style={{ justifySelf: "start" }}>{t.add}</SubmitButton>
        </form>
      )}
    </CreateSheet>
  );
}

/** "Nueva partida" in the bloque workspace; the partida goes into `segmentName` when given. */
export function NewPartidaSheet({ projectId, segmentName, t }: {
  projectId: string;
  segmentName: string | null;
  t: { newPartidaButton: string; newPartida: string; add: string; close: string };
}) {
  return (
    <CreateSheet label={t.newPartidaButton} closeLabel={t.close} triggerIcon={<Plus size={12} />}>
      {(close) => (
        <form
          action={async (fd) => {
            await createPartida(fd);
            close();
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          {segmentName && <input type="hidden" name="segment" value={segmentName} />}
          <input name="name" placeholder={t.newPartida} required className="input" />
          <SubmitButton className="btn btn-accent" style={{ justifySelf: "start" }}>{t.add}</SubmitButton>
        </form>
      )}
    </CreateSheet>
  );
}
