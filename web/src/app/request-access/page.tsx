"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestAccess, type RequestAccessState } from "@/app/actions/access";

const initial: RequestAccessState = { status: "idle" };

export default function RequestAccessPage() {
  const [state, action, pending] = useActionState(requestAccess, initial);

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={action} className="card" style={{ width: "100%", maxWidth: 420, padding: "26px 22px" }}>
        <div className="kicker">Raphel</div>
        <h1 className="h-md" style={{ margin: "6px 0 18px" }}>Solicitar acceso</h1>
        {state.status === "sent" && (
          <p style={{ background: "rgba(40,140,60,0.08)", border: "1px solid var(--line-strong)", padding: "9px 11px", borderRadius: 0, fontSize: "0.84rem", marginBottom: 14 }}>
            Gracias. Revisaremos tu solicitud y te contactaremos por correo.
          </p>
        )}
        {state.status === "error" && (
          <p style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "9px 11px", borderRadius: 0, fontSize: "0.84rem", marginBottom: 14 }}>
            {state.message}
          </p>
        )}
        <input name="business" placeholder="Nombre de la empresa" required className="input" style={{ marginBottom: 10 }} />
        <input name="name" placeholder="Tu nombre" required className="input" style={{ marginBottom: 10 }} />
        <input name="email" type="email" placeholder="Correo" required className="input" style={{ marginBottom: 10 }} autoComplete="email" />
        <input name="phone" placeholder="Teléfono" required className="input" style={{ marginBottom: 10 }} />
        <input name="website" placeholder="Sitio web o red social (opcional)" className="input" style={{ marginBottom: 10 }} />
        <textarea name="message" placeholder="Cuéntanos sobre tu empresa (opcional)" className="input" style={{ marginBottom: 18, minHeight: 72 }} />
        {/* Honeypot: hidden from users, bots fill it. */}
        <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
        <button type="submit" className="btn btn-ink" style={{ width: "100%" }} disabled={pending}>
          {pending ? "…" : "Enviar solicitud →"}
        </button>
        <div style={{ marginTop: 14 }}>
          <Link href="/login" className="mono text-steel" style={{ fontSize: "0.66rem", textDecoration: "none" }}>¿Ya tienes cuenta? Inicia sesión</Link>
        </div>
      </form>
    </div>
  );
}
