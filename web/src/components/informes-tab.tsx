"use client";
import { useActionState } from "react";
import Link from "next/link";
import { createInforme, type InformeResult } from "@/app/actions/informes";
import { SubmitButton } from "@/components/submit-button";
import { FileText } from "@/components/icons";

type InformeRow = {
  id: string; brief: string; createdAt: string; requesterName: string; scopeLabel: string; archetypeLabel: string;
  status: "PENDING" | "READY" | "FAILED"; errorMessage: string | null;
};
type Option = { id: string; name: string };
type ArchetypeDict = { label: string; owner: string; senior: string; personal: string; legacy: string; required: string };

type T = {
  title: string; hint: string; brief: string; briefPlaceholder: string;
  scope: string; scopeProject: string; scopeSegment: string; scopePartida: string;
  from: string; to: string; generate: string; generating: string;
  missingFirma: string; goToEquipo: string; empty: string; requestedBy: string; downloadPdf: string;
  reportSection: string; reportHint: string; downloadReport: string; noSealNotice: string;
  backgroundNote: string; statusGenerating: string; statusFailed: string; alreadyGenerating: string;
};

const ARCHETYPE_OPTIONS = ["OWNER", "SENIOR_MANAGEMENT", "PERSONAL_FEEDBACK"] as const;

export function InformesTab({ projectId, segments, partidas, informes, t, archetypes, hasCompanySeal = true }: {
  projectId: string;
  segments: Option[];
  partidas: Option[];
  informes: InformeRow[];
  t: T;
  archetypes: ArchetypeDict;
  /** Server-computed for every role. Without a seal neither AI generation nor
   * PDF export is permitted, preventing persisted-but-unexportable informes. */
  hasCompanySeal?: boolean;
}) {
  const [state, formAction, pending] = useActionState<InformeResult | null, FormData>(createInforme, null);
  const archetypeLabels: Record<(typeof ARCHETYPE_OPTIONS)[number], string> = {
    OWNER: archetypes.owner, SENIOR_MANAGEMENT: archetypes.senior, PERSONAL_FEEDBACK: archetypes.personal,
  };

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 20 }}>
      {/* Deterministic period report (no AI) */}
      <div className="card" style={{ padding: 16 }}>
        <div className="form-label" style={{ marginBottom: 4 }}>{t.reportSection}</div>
        <p className="mono text-steel" style={{ fontSize: "0.72rem", margin: "0 0 10px" }}>{t.reportHint}</p>
        <a href={`/api/projects/${projectId}/report`} className="btn btn-ghost" style={{ fontSize: "0.8rem", textDecoration: "none" }}>
          <FileText size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.downloadReport}
        </a>
        {!hasCompanySeal && (
          <p className="mono text-steel" role="note" style={{ fontSize: "0.7rem", margin: "10px 0 0" }}>{t.noSealNotice}</p>
        )}
      </div>

      {/* AI generator */}
      <form action={formAction} className="card" style={{ padding: 16 }}>
        <div className="form-label" style={{ marginBottom: 4 }}>{t.title}</div>
        <p className="mono text-steel" style={{ fontSize: "0.72rem", margin: "0 0 10px" }}>{t.hint}</p>
        <input type="hidden" name="projectId" value={projectId} />
        <label className="form-label" style={{ display: "block", marginBottom: 10 }}>
          {t.brief}
          <textarea name="brief" required maxLength={2000} rows={3} placeholder={t.briefPlaceholder} className="input" style={{ display: "block", width: "100%", marginTop: 4, resize: "vertical" }} />
        </label>
        {/* WS7: audience archetype — required, no preselect. Materially changes
            the AI prompt's structure/emphasis (see lib/informes/prompt.ts). */}
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">{archetypes.label}</label>
          <div className="invite-grid" style={{ marginTop: 6 }}>
            {ARCHETYPE_OPTIONS.map((a) => (
              <label key={a} className="role-option">
                <input type="radio" name="archetype" value={a} required />
                <div className="role-label">{archetypeLabels[a]}</div>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
          <label className="form-label">
            {t.scope}
            <select name="scopeRef" defaultValue={`project:${projectId}`} className="input" style={{ display: "block", marginTop: 4 }}>
              <option value={`project:${projectId}`}>{t.scopeProject}</option>
              {segments.map((s) => <option key={s.id} value={`segment:${s.id}`}>{t.scopeSegment}: {s.name}</option>)}
              {partidas.map((p) => <option key={p.id} value={`partida:${p.id}`}>{t.scopePartida}: {p.name}</option>)}
            </select>
          </label>
          <label className="form-label">
            {t.from}
            <input type="date" name="from" className="input" style={{ display: "block", marginTop: 4 }} />
          </label>
          <label className="form-label">
            {t.to}
            <input type="date" name="to" className="input" style={{ display: "block", marginTop: 4 }} />
          </label>
          <SubmitButton className="btn btn-accent" disabled={!hasCompanySeal}>{pending ? t.generating : t.generate}</SubmitButton>
        </div>
        {/* While generating: reassure that leaving the page is safe — the
            server finishes on its own and a notification announces the result. */}
        {pending && (
          <p role="status" className="mono text-steel" style={{ fontSize: "0.72rem", margin: 0 }}>{t.backgroundNote}</p>
        )}
        {!pending && state?.ok && state.status === "PENDING" && (
          <p role="status" className="mono text-steel" style={{ fontSize: "0.72rem", margin: 0 }}>{t.alreadyGenerating}</p>
        )}
        {state && !state.ok && (
          <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem" }}>
            {state.missingFirma ? (
              <>{t.missingFirma} <Link href="/app/admin" style={{ color: "var(--accent-deep)" }}>{t.goToEquipo}</Link></>
            ) : state.missingSeal ? (
              t.noSealNotice
            ) : state.error}
          </p>
        )}
      </form>

      {/* History */}
      <div className="repo-list">
        {informes.length === 0 && <div className="repo-list-empty">{t.empty}</div>}
        {informes.map((i) => (
          <div key={i.id} className="cr-row" style={{ justifyContent: "space-between" }}>
            <span className="cr-main">
              <span className="cr-title">{i.brief.length > 90 ? `${i.brief.slice(0, 90)}…` : i.brief}</span>
              <span className="cr-meta">{i.scopeLabel} · {i.archetypeLabel} · {t.requestedBy} {i.requesterName} · {i.createdAt}</span>
              {i.status === "FAILED" && i.errorMessage && (
                <span className="cr-meta" style={{ color: "var(--accent-deep)" }}>{i.errorMessage}</span>
              )}
            </span>
            {i.status === "READY" ? (
              <a href={`/api/informes/${i.id}/pdf`} className="mono" style={{ fontSize: 12, color: "var(--accent-deep)", textDecoration: "none", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", maxWidth: "100%", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {t.downloadPdf}
              </a>
            ) : (
              <span className="mono text-steel" style={{ fontSize: 12, border: "1px dashed var(--line-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", maxWidth: "100%", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {i.status === "PENDING" ? t.statusGenerating : t.statusFailed}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
