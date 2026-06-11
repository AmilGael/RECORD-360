"use client";
import { useRef, useState } from "react";
import { createChangeRequest } from "@/app/actions/cambios";
import { SubmitButton } from "@/components/submit-button";
import { ClipboardPlus } from "@/components/icons";

type T = {
  new: string; fieldTitle: string; fieldDescription: string; fieldPartidas: string;
  fieldReminder: string; fieldReminderPlaceholder: string;
  evidence: string; gps: string; gpsOk: string;
};

export function CambiosCreate({ projectId, segments, t }: {
  projectId: string;
  segments: { id: string; name: string }[];
  t: T;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => { await createChangeRequest(fd); formRef.current?.reset(); setCoords(null); }}
      className="card"
      style={{ padding: 16, marginBottom: 20 }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <input name="title" required placeholder={t.fieldTitle} className="input" style={{ marginBottom: 10 }} />
      <textarea name="description" rows={2} placeholder={t.fieldDescription} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      <div className="form-label" style={{ marginBottom: 4 }}>{t.fieldPartidas}</div>
      <select name="segmentIds" multiple required className="input" style={{ marginBottom: 10, minHeight: 90 }}>
        {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="form-label" style={{ marginBottom: 4 }}>{t.fieldReminder}</div>
      <input
        type="datetime-local"
        name="reminderDueAt"
        required
        aria-label={t.fieldReminderPlaceholder}
        className="input"
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" name="evidence" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ fontSize: "0.8rem", maxWidth: 200 }} />
        <button type="button" className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}
          onClick={() => navigator.geolocation?.getCurrentPosition((pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }))}>
          {coords ? t.gpsOk : t.gps}
        </button>
        <SubmitButton className="btn btn-accent" style={{ marginLeft: "auto" }}><ClipboardPlus size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.new}</SubmitButton>
      </div>
    </form>
  );
}
