"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setDocumentThumbnail } from "@/app/actions/documents";
import { putViaPresign, thumbFile } from "@/lib/thumbs/presign-put";

export type BackfillDoc = { id: string; url: string; fileName: string | null };

type T = { backfill: string; backfillProgress: string; backfillDone: string };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function PlanosBackfill({ docs, t }: { docs: BackfillDoc[]; t: T }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [ok, setOk] = useState(0);
  const [fail, setFail] = useState(0);
  const [finished, setFinished] = useState(false);
  const cancelled = useRef(false);

  // Reset on every mount: dev Strict Mode runs the cleanup and then the effect
  // again, and an unmount-only flag would stay true from the first render.
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  async function run() {
    if (running || docs.length === 0) return;
    setRunning(true);
    setDone(0); setOk(0); setFail(0); setFinished(false);
    let okN = 0;
    let failN = 0;
    for (let i = 0; i < docs.length; i++) {
      if (cancelled.current) return;
      const doc = docs[i];
      try {
        const res = await fetch(doc.url);
        if (!res.ok) throw new Error("fetch");
        const blob = await res.blob();
        const file = new File([blob], doc.fileName || "plano", { type: blob.type });
        const { generateThumbnail } = await import("@/lib/thumbs/generate");
        const thumb = await generateThumbnail(file);
        if (!thumb) throw new Error("thumb");
        const fd = new FormData();
        fd.set("documentId", doc.id);
        const grant = await putViaPresign(thumb, thumb.type || "image/jpeg");
        if (grant) {
          fd.set("thumbKey", grant.key);
          fd.set("thumbFileType", grant.fileType);
          fd.set("thumbExp", String(grant.exp));
          fd.set("thumbToken", grant.token);
        } else {
          fd.set("thumb", thumbFile(thumb));
        }
        const result = await setDocumentThumbnail(null, fd);
        if (!result.ok) throw new Error("set");
        okN += 1;
        setOk(okN);
      } catch {
        failN += 1;
        setFail(failN);
      }
      setDone(i + 1);
    }
    setRunning(false);
    setFinished(true);
    router.refresh();
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button type="button" className="btn btn-ghost planos-backfill" onClick={run} disabled={running}>
        {running
          ? fill(t.backfillProgress, { done, total: docs.length })
          : fill(t.backfill, { count: docs.length })}
      </button>
      {finished && (
        <p className="mono text-steel" style={{ fontSize: "0.72rem", marginTop: 6 }} role="status">
          {fill(t.backfillDone, { ok, fail })}
        </p>
      )}
    </div>
  );
}
