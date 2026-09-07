"use client";
import { useRef, useState } from "react";
import { createDocument, registerDocument, type DocResult } from "@/app/actions/documents";
import { Upload } from "@/components/icons";
import type { DocumentKind } from "@prisma/client";

type T = { upload: string; title: string; error: string };

type PresignResponse =
  | { direct: false; error?: string }
  | { direct: true; url: string; key: string; fileType: string; exp: number; token: string };

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload path: try a presigned direct-to-storage PUT first — server actions on
 * Netlify sit behind a ~4.4 MB function body ceiling, well under a real plano
 * PDF, so routing bytes through the action 413s in prod. The presign route
 * validates type/size and hands back a grant; the file goes straight to the
 * bucket and registerDocument records only metadata. When presign isn't
 * available (local disk storage in dev) or fails (e.g. missing bucket CORS),
 * fall back to the original server-action upload, which still works for files
 * under the platform ceiling.
 */
export function PlanosUpload({ projectId, segmentId, kind = "PLANO", t }: { projectId: string; segmentId?: string | null; kind?: DocumentKind; t: T }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadDirect(file: File, fd: FormData): Promise<DocResult | null> {
    let presign: PresignResponse;
    try {
      const res = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const body = (await res.json()) as PresignResponse & { error?: string };
      // Validation rejections (bad type / too large) are final — the server
      // action would refuse the same file, so surface the message instead of
      // falling back and re-uploading doomed bytes.
      if (res.status === 413 || res.status === 415) return { ok: false, error: body.error ?? t.error };
      if (!res.ok) return null;
      presign = body;
    } catch {
      return null; // network/route failure — try the server-action path
    }
    if (!presign.direct) return null;

    const bytes = await file.arrayBuffer();
    try {
      const put = await fetch(presign.url, { method: "PUT", headers: { "Content-Type": file.type }, body: bytes });
      if (!put.ok) return null;
    } catch {
      return null; // CORS/network — fall back
    }

    const rfd = new FormData();
    rfd.set("projectId", String(fd.get("projectId") ?? ""));
    const seg = fd.get("segmentId");
    if (typeof seg === "string" && seg) rfd.set("segmentId", seg);
    rfd.set("kind", String(fd.get("kind") ?? "PLANO"));
    rfd.set("title", String(fd.get("title") ?? ""));
    rfd.set("key", presign.key);
    rfd.set("fileType", presign.fileType);
    rfd.set("exp", String(presign.exp));
    rfd.set("token", presign.token);
    rfd.set("sha256", hex(await crypto.subtle.digest("SHA-256", bytes)));
    return registerDocument(null, rfd);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    setPending(true);
    setError(null);
    try {
      let result: DocResult | null = null;
      if (file instanceof File && file.size > 0) result = await uploadDirect(file, fd);
      result ??= await createDocument(null, fd);
      if (result.ok) form.reset();
      else setError(result.error || t.error);
    } catch {
      setError(t.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card" style={{ padding: 16, marginBottom: 20 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
      {segmentId && <input type="hidden" name="segmentId" value={segmentId} />}
      <input name="title" placeholder={t.title} className="input" style={{ marginBottom: 10 }} />
      {error && (
        <p role="alert" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" disabled={pending} />
        <button type="submit" className="btn btn-accent" style={{ marginLeft: "auto" }} disabled={pending} aria-busy={pending}>
          <Upload size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
          {t.upload}
        </button>
      </div>
    </form>
  );
}
