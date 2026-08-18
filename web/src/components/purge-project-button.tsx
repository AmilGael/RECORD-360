"use client";
import { useState } from "react";
import { purgeProject } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Trash } from "@/components/icons";

type T = { purge: string; purgeConfirm: string; yes: string; no: string };

export function PurgeProjectButton({ projectId, t }: { projectId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-danger-soft mono"
        style={{
          padding: "0.28rem 0.7rem",
          fontSize: "0.68rem",
          letterSpacing: "0.08em",
        }}
      >
        <Trash size={11} />{t.purge}
      </button>
    );
  }

  return (
    <form action={purgeProject} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <span className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)" }}>
        {t.purgeConfirm}
      </span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>
        {t.yes}
      </SubmitButton>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="btn btn-ghost"
        style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}
      >
        {t.no}
      </button>
    </form>
  );
}
