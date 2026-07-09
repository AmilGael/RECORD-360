import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/operator";
import { approveRequest, rejectRequest, resendActivation } from "@/app/actions/access";
import { SubmitButton } from "@/components/submit-button";

export default async function AccessRequestsPage() {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/app");
  }

  const pending = await prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const resolved = await prisma.accessRequest.findMany({ where: { status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 25 });

  return (
    <div className="reveal" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="dash-header">
        <div>
          <div className="kicker">OPERADOR</div>
          <h1 className="h-lg" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "6px 0 0" }}>Solicitudes de acceso</h1>
        </div>
        <span className="counter">{pending.length} pendientes</span>
      </div>

      {pending.length === 0 && (
        <p className="mono text-steel" style={{ fontSize: "0.8rem" }}>No hay solicitudes pendientes.</p>
      )}

      {pending.map((r) => (
        <div key={r.id} className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>{r.businessName}</div>
          <div className="mono text-steel" style={{ fontSize: "0.74rem", marginTop: 4 }}>
            {r.contactName} · {r.email} · {r.phone}
            {r.website ? ` · ${r.website}` : ""}
          </div>
          {r.message && <p style={{ fontSize: "0.82rem", margin: "8px 0 0" }}>{r.message}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <form action={approveRequest}>
              <input type="hidden" name="requestId" value={r.id} />
              <SubmitButton className="btn btn-accent">Aprobar</SubmitButton>
            </form>
            <form action={rejectRequest}>
              <input type="hidden" name="requestId" value={r.id} />
              <SubmitButton className="btn btn-ghost">Rechazar</SubmitButton>
            </form>
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <div className="team-section" style={{ marginTop: 24 }}>
          <div className="team-section-head">Historial</div>
          {resolved.map((r) => (
            <div key={r.id} className="member-card">
              <div className="member-info">
                <div className="member-name">{r.businessName}</div>
                <div className="member-email">{r.email} — {r.status}</div>
              </div>
              {r.status === "APPROVED" && r.createdUserId && (
                <form action={resendActivation}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <SubmitButton className="btn btn-ghost" style={{ fontSize: "0.7rem" }}>Reenviar enlace</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
