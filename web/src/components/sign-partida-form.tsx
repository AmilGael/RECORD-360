"use client";
import { useActionState, useEffect, useRef } from "react";
import { signPartidaAction, type SignResult } from "@/app/actions/signatures";

export function SignPartidaForm({
  partidaId,
  t,
}: {
  partidaId: string;
  t: {
    sign: string;
    password: string;
    statement: string;
    statementPlaceholder: string;
    signed: string;
  };
}) {
  const [state, action, pending] = useActionState<SignResult | null, FormData>(signPartidaAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the password on success; keep input intact on error.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      <label className="kicker" htmlFor="sign-statement">{t.statement}</label>
      <input id="sign-statement" name="statement" placeholder={t.statementPlaceholder} />
      <label className="kicker" htmlFor="sign-password">{t.password}</label>
      <input id="sign-password" name="password" type="password" required autoComplete="current-password" />
      <button type="submit" disabled={pending} className="btn">{t.sign}</button>
      {state && !state.ok && (
        <p role="alert" style={{ color: "var(--danger, #c0392b)", margin: 0 }}>{state.error}</p>
      )}
      {state?.ok && <p style={{ color: "var(--ok, #2e7d32)", margin: 0 }}>{t.signed}</p>}
    </form>
  );
}
