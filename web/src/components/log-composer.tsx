"use client";
import { useEffect, useRef, useState, useId, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logRegistro } from "@/app/actions/registro";
import { SubmitButton } from "@/components/submit-button";

type ComposerT = {
  placeholder: string;
  gps: string;
  gpsOk: string;
  gpsLoading: string;
  submit: string;
  sending: string;
  error: string;
  category: string;
  noCategory: string;
  location: string;
  reminder?: string;
  categories: Record<string, string>;
};

export function LogComposer({
  partidaId, t, locations, correction, reply,
}: {
  partidaId: string;
  t: ComposerT;
  locations: string[];
  correction?: { id: string; label: string; cancelLabel: string; notice: string } | null;
  reply?: { id: string; label: string; cancelLabel: string; notice: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [state, formAction] = useActionState(logRegistro, null);

  // Automatic GPS capture on mount (no button). Silent on denial — the note still saves.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }, []);

  // On success: clear the form and (if correcting) return to the partida. On
  // error: keep everything the user typed and show the message.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      if (correction || reply) router.replace(`/app/partidas/${partidaId}`);
    }
  }, [state, correction, reply, partidaId, router]);

  return (
    <form ref={formRef} action={formAction} className="card" style={{ padding: 16, marginBottom: 28 }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      {correction && <input type="hidden" name="correctionOfId" value={correction.id} />}
      {reply && <input type="hidden" name="replyToId" value={reply.id} />}
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      {correction && (
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: "0.7rem", marginBottom: 10 }}>
          <span>{correction.notice} {correction.label}</span>
          <Link href={`/app/partidas/${partidaId}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>{correction.cancelLabel}</Link>
        </div>
      )}
      {reply && (
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: "0.7rem", marginBottom: 10 }}>
          <span>{reply.notice} {reply.label}</span>
          <Link href={`/app/partidas/${partidaId}`} style={{ color: "var(--accent-deep)", textDecoration: "none" }}>{reply.cancelLabel}</Link>
        </div>
      )}
      <textarea name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      {state && !state.ok && (
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {state.error || t.error}
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
        <label className="mono text-steel" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.68rem" }}>
          {t.reminder ?? "Reminder"}
          <input type="datetime-local" name="reminderDueAt" className="input" style={{ width: 190 }} />
        </label>
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/webm" style={{ fontSize: "0.8rem", maxWidth: 220 }} />
        <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{coords ? t.gpsOk : t.gps}</span>
        <SubmitButton className="btn btn-ink" style={{ marginLeft: "auto" }} pendingLabel={t.sending}>
          {t.submit} <span className="arrow">→</span>
        </SubmitButton>
      </div>
    </form>
  );
}
