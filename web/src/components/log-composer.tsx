"use client";
import { useRef, useState } from "react";
import { logRegistro } from "@/app/actions/registro";
import { SubmitButton } from "@/components/submit-button";

type ComposerT = {
  placeholder: string;
  progress: string;
  gps: string;
  gpsOk: string;
  submit: string;
  sending: string;
};

export function LogComposer({ partidaId, t }: { partidaId: string; t: ComposerT }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  function captureGps() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await logRegistro(fd);
        formRef.current?.reset();
        setCoords(null);
      }}
      className="card"
      style={{ padding: 16, marginBottom: 28 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <textarea name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" style={{ fontSize: "0.8rem", maxWidth: 190 }} />
        <input type="number" name="progressPct" min={0} max={100} placeholder={t.progress} className="input" style={{ width: 118 }} />
        <button type="button" onClick={captureGps} className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>
          {coords ? t.gpsOk : t.gps}
        </button>
        <SubmitButton className="btn btn-ink" style={{ marginLeft: "auto" }} pendingLabel={t.sending}>
          {t.submit} <span className="arrow">→</span>
        </SubmitButton>
      </div>
    </form>
  );
}
