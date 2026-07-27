import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Link from "next/link";
import { getDict } from "@/i18n/server";
import { formatTimestamp } from "@/lib/format/datetime";
import { resolveChangeRequest } from "@/app/actions/cambios";
import { SubmitButton } from "@/components/submit-button";
import { Pin } from "@/components/icons";
import type { Lang } from "@/i18n/dictionaries";
import { projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export default async function CambioDetail({ params }: { params: Promise<{ id: string; crId: string }> }) {
  const { id, crId } = await params;
  const session = await auth();
  const u = session!.user as { id: string; companyId: string; role: Role };
  const { lang, t } = await getDict();
  const C = t.changes;
  const R = t.requests;

  const cr = await prisma.changeRequest.findFirstOrThrow({
    where: { id: crId, projectId: id, project: projectAccessWhere(u) },
    include: {
      segments: { include: { segment: { select: { name: true } } } },
      partidas: { include: { partida: { select: { name: true } } } },
      attachments: true,
    },
  });

  const resolverName = cr.resolvedById
    ? (await prisma.user.findFirst({ where: { id: cr.resolvedById, companyId: u.companyId }, select: { name: true } }))?.name ?? null
    : null;

  const isManager = u.role === "ADMIN" || u.role === "MANAGER";
  // ADMIN may resolve their own request (small-team reality — single admin who also files requests).
  // MANAGER cannot (4-eyes rule enforced on the server too).
  const canResolve = isManager && cr.status === "OPEN" && (u.role === "ADMIN" || cr.authorId !== u.id);
  const dot = cr.status === "OPEN" ? "open" : cr.status === "INTEGRATED" ? "merged" : "rej";

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <Link href={`/app/projects/${id}?tab=cambios`} className="kicker" style={{ textDecoration: "none" }}>← {R.tab}</Link>
      <div className="cr-detail card" style={{ marginTop: 12 }}>
        <div className="cr-detail-head">
          <span className="mono" style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}>{cr.code}</span>
          <span className="state-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={`pdot ${dot}`} aria-hidden="true" /> {C.states[cr.status]}
          </span>
        </div>
        <Field label={R.kindLabel}>{cr.kind === "ALERT" ? R.kindAlert : R.kindChange}</Field>
        <Field label={R.severityLabel}>
          <span className={`severity-chip ${cr.severity === "CRITICAL" ? "is-critical" : "is-important"}`}>
            {cr.severity === "CRITICAL" ? R.severityCritical : R.severityImportant}
          </span>
        </Field>
        <Field label={C.fieldTitle}><span className="h-md" style={{ fontSize: "1.05rem" }}>{cr.title}</span></Field>
        {cr.description && <Field label={C.fieldDescription}>{cr.description}</Field>}
        <Field label={C.fieldPartidas}>
          {(cr.segments.length ? cr.segments : cr.partidas).map((p) => (
            <span key={"segment" in p ? p.segmentId : p.partidaId} className="chip">{"segment" in p ? p.segment.name : p.partida.name}</span>
          ))}
        </Field>
        <Field label={C.requester}>
          {cr.gpsLat != null && <><Pin size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{`${Number(cr.gpsLat).toFixed(4)} · `}</>}
          {formatTimestamp(cr.createdAt, lang as Lang)}
        </Field>
        {cr.reminderDueAt && (
          <Field label={C.fieldReminder}>{formatTimestamp(cr.reminderDueAt, lang as Lang)}</Field>
        )}
        {cr.attachments.length > 0 && (
          <Field label={C.evidence}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {cr.attachments.map((a, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.url} alt={`${C.evidence} ${i + 1}`} style={{ width: "100%", borderRadius: "var(--radius-sm)", display: "block" }} />
              ))}
            </div>
          </Field>
        )}
        {cr.status !== "OPEN" && resolverName && (
          <Field label={C.resolvedBy}>{resolverName}</Field>
        )}
        {cr.status === "REJECTED" && (cr.resolutionNote ?? cr.rejectionReason) && (
          <Field label={C.resolutionNote}>{cr.resolutionNote ?? cr.rejectionReason}</Field>
        )}
        {cr.status === "INTEGRATED" && cr.resolutionNote && (
          <Field label={C.resolutionNote}>{cr.resolutionNote}</Field>
        )}
        {cr.status === "INTEGRATED" && cr.seal && (
          <Field label={C.seal}><span className="mono">{cr.seal.slice(0, 8)}…{cr.seal.slice(-4)}</span> · {cr.resolvedAt ? formatTimestamp(cr.resolvedAt, lang as Lang) : ""}</Field>
        )}
        {canResolve && (
          <div className="cr-actions">
            <form action={resolveChangeRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="INTEGRATE" />
              <textarea name="resolutionNote" required rows={2} className="input" placeholder={C.resolutionNotePlaceholder} style={{ width: "min(100%, 360px)", resize: "vertical" }} aria-label={C.resolutionNote} />
              <SubmitButton className="btn" style={{ background: "var(--state-merged)", color: "#fff" }}>{C.integrate}</SubmitButton>
            </form>
            <form action={resolveChangeRequest} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="changeRequestId" value={cr.id} />
              <input type="hidden" name="action" value="REJECT" />
              <textarea name="resolutionNote" required rows={2} className="input" placeholder={C.resolutionNotePlaceholder} style={{ width: "min(100%, 360px)", resize: "vertical" }} aria-label={C.resolutionNote} />
              <SubmitButton className="btn btn-ghost">{C.reject}</SubmitButton>
            </form>
            <span className="mono text-steel" style={{ fontSize: "0.62rem", marginLeft: "auto", alignSelf: "center" }}>{C.managerOnly}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cr-field">
      <div className="form-label">{label}</div>
      <div style={{ marginTop: 3, fontSize: "0.88rem" }}>{children}</div>
    </div>
  );
}
