"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePartida } from "@/app/actions/partida-crud";
import { SubmitButton } from "@/components/submit-button";

type T = { del: string; delConfirm: string; yes: string; no: string };

export function PartidaDeleteButton({ partidaId, projectId, t }: { partidaId: string; projectId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--steel)", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
        {t.del}
      </button>
    );
  }
  return (
    <form
      action={async (fd) => { await deletePartida(fd); router.push(`/app/projects/${projectId}`); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      <span className="mono" style={{ fontSize: "0.72rem", color: "var(--accent-deep)" }}>{t.delConfirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.no}</button>
    </form>
  );
}
