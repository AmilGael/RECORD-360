"use client";
import { useEffect, useRef, useActionState } from "react";
import { createDocument } from "@/app/actions/documents";
import { SubmitButton } from "@/components/submit-button";
import { Upload } from "@/components/icons";
import type { DocumentKind } from "@prisma/client";

type T = { upload: string; title: string; error: string };

export function PlanosUpload({ projectId, segmentId, kind = "PLANO", t }: { projectId: string; segmentId?: string | null; kind?: DocumentKind; t: T }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(createDocument, null);

  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);

  return (
    <form ref={formRef} action={formAction} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
      {segmentId && <input type="hidden" name="segmentId" value={segmentId} />}
      <input name="title" placeholder={t.title} className="input" style={{ marginBottom: 10 }} />
      {state && !state.ok && (
        <p role="alert" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {state.error || t.error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
        <SubmitButton className="btn btn-accent" style={{ marginLeft: "auto" }}><Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.upload}</SubmitButton>
      </div>
    </form>
  );
}
