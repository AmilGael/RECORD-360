"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/password-reset";

const initial: ForgotPasswordState = { status: "idle" };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 380, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Restablecer contraseña</h1>
        {state.status === "sent" && (
          <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            Si existe una cuenta con ese correo, enviaremos un enlace para restablecer la contraseña.
          </p>
        )}
        {state.status === "error" && (
          <p style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 3, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input name="email" type="email" placeholder="Correo" required className="input" style={{ marginBottom: 18 }} autoComplete="email" autoFocus />
        {/* Honeypot: hidden from users, bots fill it. */}
        <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Enviar enlace →"}
        </button>
        <div style={{ marginTop: 14 }}>
          <Link href="/login" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>← Volver a iniciar sesión</Link>
        </div>
      </form>
    </div>
  );
}
