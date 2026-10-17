"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createChangeRequest, type CreateChangeRequestState } from "@/app/actions/cambios";
import { ClipboardPlus } from "@/components/icons";
import { datetimeLocalToIso, useDatetimeLocalMin } from "@/lib/time/local-input";

type GpsState = "acquiring" | "acquired" | "denied" | "unavailable" | "timeout" | "invalid";

type T = {
  new: string; fieldTitle: string; fieldDescription: string; fieldPartidas: string;
  fieldReminder: string; fieldReminderPlaceholder: string;
  evidence: string;
  kindLabel: string; kindChange: string; kindAlert: string;
  severityLabel: string; severityImportant: string; severityCritical: string;
  gpsAcquiring: string; gpsAcquired: string; gpsDenied: string; gpsUnavailable: string;
  gpsTimeout: string; gpsInvalid: string; gpsRetry: string;
};

const INITIAL: CreateChangeRequestState = { status: "idle" };

export function CambiosCreate({ projectId, segments, fixedSegment, t }: {
  projectId: string;
  segments: { id: string; name: string }[];
  fixedSegment?: { id: string; name: string };
  t: T;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>("acquiring");
  const [state, formAction, pending] = useActionState(createChangeRequest, INITIAL);
  const reminderMin = useDatetimeLocalMin();
  // The datetime-local value is device wall time; turn it into an instant here,
  // where the device zone is known. Without JS the raw value still posts and
  // the server reads it in APP_TIME_ZONE.
  const submit = (fd: FormData) => {
    const iso = datetimeLocalToIso(String(fd.get("reminderDueAt") ?? ""));
    if (iso) fd.set("reminderDueAt", iso);
    formAction(fd);
  };

  // GPS state machine (WS5 §6): acquiring -> acquired | denied | unavailable |
  // timeout | invalid. Starts automatically on mount; Retry re-triggers.
  // Submission stays disabled until "acquired" with in-range coordinates —
  // the server re-validates independently (lib/cambios/validate.ts), this is
  // just the UX gate.
  const acquireGps = () => {
    setGpsState("acquiring");
    if (!("geolocation" in navigator)) { setGpsState("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          setGpsState("invalid");
          return;
        }
        setCoords({ lat: latitude, lng: longitude });
        setGpsState("acquired");
      },
      (err) => {
        setGpsState(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  };

  useEffect(() => { acquireGps(); }, []);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setCoords(null);
      acquireGps();
    }
  }, [state]);

  const gpsMessage: Record<GpsState, string> = {
    acquiring: t.gpsAcquiring, acquired: t.gpsAcquired, denied: t.gpsDenied,
    unavailable: t.gpsUnavailable, timeout: t.gpsTimeout, invalid: t.gpsInvalid,
  };
  const canRetryGps = gpsState !== "acquiring" && gpsState !== "acquired";
  const canSubmit = gpsState === "acquired" && coords !== null && !pending;

  return (
    <form
      ref={formRef}
      action={submit}
      className="card"
      style={{ padding: 16, marginBottom: 20 }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />

      {state.status === "error" && (
        <p role="alert" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {state.message}
        </p>
      )}

      <div className="form-label" style={{ marginBottom: 4 }}>{t.kindLabel}</div>
      <div role="radiogroup" aria-label={t.kindLabel} style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: "0.84rem" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" name="kind" value="CHANGE" required /> {t.kindChange}
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" name="kind" value="ALERT" required /> {t.kindAlert}
        </label>
      </div>

      <div className="form-label" style={{ marginBottom: 4 }}>{t.severityLabel}</div>
      <div role="radiogroup" aria-label={t.severityLabel} style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: "0.84rem" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" name="severity" value="IMPORTANT" required /> {t.severityImportant}
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" name="severity" value="CRITICAL" required /> {t.severityCritical}
        </label>
      </div>

      <input name="title" required placeholder={t.fieldTitle} className="input" style={{ marginBottom: 10 }} />
      <textarea name="description" rows={2} placeholder={t.fieldDescription} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      <div className="form-label" style={{ marginBottom: 4 }}>{t.fieldPartidas}</div>
      {fixedSegment ? (
        <>
          <input type="hidden" name="segmentIds" value={fixedSegment.id} />
          <div className="input" aria-label={t.fieldPartidas} style={{ marginBottom: 10, background: "var(--paper-3)" }}>
            {fixedSegment.name}
          </div>
        </>
      ) : (
        <select name="segmentIds" multiple required className="input" style={{ marginBottom: 10, minHeight: 90 }}>
          {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="form-label" style={{ marginBottom: 4 }}>{t.fieldReminder}</div>
      <input
        type="datetime-local"
        name="reminderDueAt"
        required
        min={reminderMin}
        aria-label={t.fieldReminderPlaceholder}
        className="input"
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" name="evidence" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ maxWidth: 220 }} />
        <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{gpsMessage[gpsState]}</span>
        {canRetryGps && (
          <button type="button" className="btn btn-ghost" style={{ padding: "0.4rem 0.75rem", fontSize: "0.76rem" }} onClick={acquireGps}>
            {t.gpsRetry}
          </button>
        )}
        <button type="submit" className="btn btn-accent" style={{ marginLeft: "auto" }} disabled={!canSubmit} aria-busy={pending}>
          <ClipboardPlus size={12} style={{ verticalAlign: -1, marginRight: 5 }} />{t.new}
        </button>
      </div>
    </form>
  );
}
