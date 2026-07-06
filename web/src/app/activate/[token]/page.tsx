"use client";
import { use, useActionState } from "react";
import { activateAccount, type ActivateState } from "@/app/actions/activation";

const initial: ActivateState = { status: "idle" };

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action, pending] = useActionState(activateAccount, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Define tu contraseña</h1>
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input type="hidden" name="token" value={token} />
        <input name="password" type="password" placeholder="Nueva contraseña" required minLength={12} className="input" style={{ marginBottom: 10 }} autoComplete="new-password" />
        <input name="confirm" type="password" placeholder="Confirmar contraseña" required minLength={12} className="input" style={{ marginBottom: 18 }} autoComplete="new-password" />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Activar cuenta →"}
        </button>
      </form>
    </div>
  );
}
