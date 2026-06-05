"use client";
import { useState } from "react";
import { resetUserPassword } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type T = { resetPw: string; resetConfirm: string; yes: string; no: string };

export function ResetPasswordButton({ userId, t }: { userId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mono"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--steel)",
          fontSize: "0.7rem",
          letterSpacing: "0.08em",
          transition: "color 0.18s var(--ease)",
        }}
      >
        {t.resetPw}
      </button>
    );
  }

  return (
    <form action={resetUserPassword} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="userId" value={userId} />
      <span className="mono" style={{ fontSize: "0.7rem", color: "var(--accent-deep)" }}>{t.resetConfirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}>{t.yes}</SubmitButton>
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
