"use client";
import { useState } from "react";
import { deleteSegment } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Trash } from "@/components/icons";

type T = { deleteBloque: string; deleteBloqueConfirm: string; yes: string; no: string };

export function DeleteSegmentButton({ segmentId, t }: { segmentId: string; t: T }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn btn-danger-soft mono" style={{ padding: "0.22rem 0.6rem", fontSize: "0.64rem", letterSpacing: "0.08em" }}>
        <Trash size={10} />{t.deleteBloque}
      </button>
    );
  }
  return (
    <form action={deleteSegment} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="segmentId" value={segmentId} />
      <span className="mono" style={{ fontSize: "0.66rem", color: "var(--accent-deep)" }}>{t.deleteBloqueConfirm}</span>
      <SubmitButton className="btn btn-accent" style={{ padding: "0.22rem 0.6rem", fontSize: "0.68rem" }}>{t.yes}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost" style={{ padding: "0.22rem 0.6rem", fontSize: "0.68rem" }}>{t.no}</button>
    </form>
  );
}
