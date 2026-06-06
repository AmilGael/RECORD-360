"use client";
import { useState } from "react";
import { archiveProject } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type T = { archive: string; confirm: string; yes: string; no: string };

export function ArchiveButton({ projectId, t }: { projectId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mono"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--steel)", fontSize: "0.7rem", letterSpacing: "0.08em", transition: "color 0.18s var(--ease)" }}
      >
        {t.archive}
      </button>
    );
  }

  return (
    <form action={archiveProject} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <span className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)" }}>{t.confirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.no}</button>
    </form>
  );
}
