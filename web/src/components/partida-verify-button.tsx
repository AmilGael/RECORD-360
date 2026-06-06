"use client";
import { useActionState } from "react";
import { verifyPartidaChain, type VerifyResult } from "@/app/actions/verify";
import { SubmitButton } from "@/components/submit-button";
import { Check } from "@/components/icons";

type T = {
  verify: string;
  verifyOk: string;
  verifyBroken: string;
  verifyError: string;
};

export function PartidaVerifyButton({ partidaId, t }: { partidaId: string; t: T }) {
  const [state, formAction] = useActionState<VerifyResult | null, FormData>(verifyPartidaChain, null);

  return (
    <form action={formAction} style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      <SubmitButton
        className="mono"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--steel)", fontSize: "0.72rem", letterSpacing: "0.06em" }}
        pendingLabel={t.verify}
      >
        {t.verify}
      </SubmitButton>
      {state && state.status === "ok" && (
        <span
          className="mono"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.72rem", color: "var(--steel)" }}
        >
          <Check size={12} />
          {t.verifyOk} ({state.count})
        </span>
      )}
      {state && state.status === "broken" && (
        <span
          className="mono"
          style={{ fontSize: "0.72rem", color: "var(--accent-deep)" }}
        >
          {t.verifyBroken}
        </span>
      )}
      {state && state.status === "error" && (
        <span
          className="mono"
          style={{ fontSize: "0.72rem", color: "var(--accent-deep)" }}
        >
          {t.verifyError}
        </span>
      )}
    </form>
  );
}
