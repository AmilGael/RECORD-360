"use client";
import { useState } from "react";
import { archiveUser, restoreUser } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type T = { archiveMember: string; archiveConfirm: string; restoreMember: string; restoreConfirm: string; yes: string; no: string };

/**
 * ADMIN-only archive/restore control for a team row (R3 WS2A). The server
 * actions (archiveUser/restoreUser, Agent 1) are the actual authority — this
 * is presentation only, mirroring the confirm-then-submit pattern already
 * used by ResetPasswordButton.
 */
export function ArchiveRestoreButton({ userId, mode, t }: { userId: string; mode: "archive" | "restore"; t: T }) {
  const [confirming, setConfirming] = useState(false);
  const action = mode === "archive" ? archiveUser : restoreUser;
  const label = mode === "archive" ? t.archiveMember : t.restoreMember;
  const confirmLabel = mode === "archive" ? t.archiveConfirm : t.restoreConfirm;

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="icon-action">
        {label}
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="hidden" name="userId" value={userId} />
      <span className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)" }}>{confirmLabel}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>
        {t.no}
      </button>
    </form>
  );
}
