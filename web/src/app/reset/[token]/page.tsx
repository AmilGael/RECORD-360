"use client";
import { use, useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "@/app/actions/password-reset";
import { PasswordFields } from "@/components/password-fields";

const initial: ResetPasswordState = { status: "idle" };

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Nueva contraseña</h1>
        {state.status === "error" && (
          <p style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 0, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input type="hidden" name="token" value={token} />
        <PasswordFields />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Guardar contraseña →"}
        </button>
      </form>
    </div>
  );
}
