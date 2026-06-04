"use client";
import { useRef, useState, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logRegistro } from "@/app/actions/registro";
import { SubmitButton } from "@/components/submit-button";

type ComposerT = {
  placeholder: string;
  progress: string;
  gps: string;
  gpsOk: string;
  gpsLoading: string;
  submit: string;
  sending: string;
  error: string;
  category: string;
  noCategory: string;
  location: string;
  categories: Record<string, string>;
};

export function LogComposer({
  partidaId, t, locations, correction,
}: {
  partidaId: string;
  t: ComposerT;
  locations: string[];
  correction?: { id: string; label: string; cancelLabel: string; notice: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsPending, setGpsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function captureGps() {
    if (!navigator.geolocation) return;
    setGpsPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsPending(false);
      },
      () => {
        setCoords(null);
        setGpsPending(false);
      },
    );
  }

  const gpsLabel = gpsPending ? t.gpsLoading : coords ? t.gpsOk : t.gps;

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setError(null);
        try {
          await logRegistro(fd);
          formRef.current?.reset();
          setCoords(null);
          if (correction) router.replace(`/app/partidas/${partidaId}`);
        } catch {
          setError(t.error);
        }
      }}
      className="card"
      style={{ padding: 16, marginBottom: 28 }}
    >
      <input type="hidden" name="partidaId" value={partidaId} />
      {correction && <input type="hidden" name="correctionOfId" value={correction.id} />}
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      {correction && (
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: "0.7rem", marginBottom: 10 }}>
          <span>{correction.notice} {correction.label}</span>
          <Link href={`/app/partidas/${partidaId}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>{correction.cancelLabel}</Link>
        </div>
      )}
      <textarea name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      {error && (
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select name="category" className="input" defaultValue="" style={{ width: "auto" }} aria-label={t.category}>
          <option value="">{t.noCategory}</option>
          {Object.entries(t.categories).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input name="location" list={listId} placeholder={t.location} className="input" style={{ maxWidth: 240 }} />
        <datalist id={listId}>
          {locations.map((l) => <option key={l} value={l} />)}
        </datalist>
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ fontSize: "0.8rem", maxWidth: 200 }} />
        <input type="number" name="progressPct" min={0} max={100} placeholder={t.progress} className="input" style={{ width: 118 }} />
        <button type="button" onClick={captureGps} disabled={gpsPending} className="btn btn-ghost" style={{ padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}>
          {gpsLabel}
        </button>
        <SubmitButton className="btn btn-ink" style={{ marginLeft: "auto" }} pendingLabel={t.sending}>
          {t.submit} <span className="arrow">→</span>
        </SubmitButton>
      </div>
    </form>
  );
}
