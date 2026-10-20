"use client";
import { useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import { IndexedDbQueue } from "@/lib/offline/queue";
import type { QueuedRegistro } from "@/lib/offline/types";
import { SYNC_ACCEPTED_EVENT, nextCaptureState, syncErrorText, type CaptureState, type SyncErrorLabels } from "@/lib/offline/capture-status";
import type { Lang } from "@/i18n/dictionaries";
import { classifyDictationError, mergeTranscript } from "@/lib/dictation";
import { datetimeLocalToIso, useDatetimeLocalMin } from "@/lib/time/local-input";

// Minimal structural type for the Web Speech API recogniser — avoids `any`.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { length: number; [i: number]: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type WindowWithSpeech = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

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
  dictate?: string;
  listening?: string;
  dictateUnsupported?: string;
  dictateErrorPermission?: string;
  dictateErrorNoSpeech?: string;
  dictateErrorNetwork?: string;
  dictateErrorAborted?: string;
  dictateErrorOther?: string;
  savedOnDevice: string;
  savedSealed: string;
  savedFailed: string;
  savedFailedHint: string;
  categories: Record<string, string>;
};

const SEALED_NOTICE_MS = 4000;

// Lazy browser-only singleton — IndexedDB is only touched inside event handlers.
let _queue: IndexedDbQueue | null = null;
function getQueue(): IndexedDbQueue {
  if (!_queue) _queue = new IndexedDbQueue();
  return _queue;
}
function emitQueueChanged() {
  window.dispatchEvent(new Event("raphl:queue-changed"));
}

export function LogComposer({
  partidaId, t, syncErrors, locations, correction, reply, lang,
}: {
  partidaId: string;
  t: ComposerT;
  syncErrors: SyncErrorLabels;
  locations: string[];
  correction?: { id: string; label: string; cancelLabel: string; notice: string } | null;
  reply?: { id: string; label: string; cancelLabel: string; notice: string } | null;
  lang?: Lang;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<{ id: string; state: CaptureState } | null>(null);
  const reminderMin = useDatetimeLocalMin();

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as WindowWithSpeech;
    setSpeechSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  // Stop any in-flight recognition and release the instance on unmount (route
  // change, tab close) so the mic isn't left listening after the composer is gone.
  useEffect(() => {
    return () => {
      recRef.current?.stop();
      recRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }, []);

  // Sealed only on the server's acceptance. Mounted for the composer's whole
  // life, not per capture: an online sync can accept the item before the
  // per-capture effect below has subscribed.
  useEffect(() => {
    const onAccepted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setCapture((c) => (c && c.id === id ? { id, state: { kind: "sealed" } } : c));
    };
    window.addEventListener(SYNC_ACCEPTED_EVENT, onAccepted);
    return () => window.removeEventListener(SYNC_ACCEPTED_EVENT, onAccepted);
  }, []);

  // Follow the registro just queued until the server seals it or refuses it.
  const captureId = capture?.id ?? null;
  useEffect(() => {
    if (!captureId) return;
    const check = () => {
      void getQueue().all().then((queued) => {
        setCapture((c) => (c && c.id === captureId ? { id: c.id, state: nextCaptureState(c.state, c.id, queued) } : c));
      }).catch(() => {});
    };
    check();
    window.addEventListener("raphl:sync-progress", check);
    window.addEventListener("raphl:queue-changed", check);
    return () => {
      window.removeEventListener("raphl:sync-progress", check);
      window.removeEventListener("raphl:queue-changed", check);
    };
  }, [captureId]);

  const captureKind = capture?.state.kind ?? null;
  useEffect(() => {
    if (captureKind !== "sealed") return;
    const timer = window.setTimeout(() => setCapture(null), SEALED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [captureKind]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const text = String(fd.get("text") ?? "").trim() || null;
    const files = (fd.getAll("photos").filter((f): f is File => f instanceof File)).filter((f) => f.size > 0);
    if (!text && files.length === 0) {
      setError(t.error);
      return;
    }
    const item: QueuedRegistro = {
      id: crypto.randomUUID(),
      partidaId,
      text,
      category: (String(fd.get("category") ?? "").trim()) || null,
      gpsLat: coords?.lat ?? null,
      gpsLng: coords?.lng ?? null,
      locationLabel: (String(fd.get("location") ?? "").trim()) || null,
      correctionOfId: correction?.id ?? null,
      replyToId: reply?.id ?? null,
      reminderDueAt: datetimeLocalToIso(String(fd.get("reminderDueAt") ?? "")) || null,
      clientCapturedAt: new Date().toISOString(),
      attachments: files.map((f) => ({ blob: f, filename: f.name, contentType: f.type })),
      status: "pending",
      attempts: 0,
    };
    setPending(true);
    try {
      await getQueue().enqueue(item);
      form.reset();
      setCapture({ id: item.id, state: { kind: "on-device" } });
      // OfflineProvider syncs on this event and refreshes the feed only once
      // the server has accepted the item.
      emitQueueChanged();
      if (correction || reply) router.replace(`/app/partidas/${partidaId}`);
    } catch {
      setError(t.error);
    } finally {
      setPending(false);
    }
  }

  function dictationErrorMessage(kind: ReturnType<typeof classifyDictationError>): string {
    switch (kind) {
      case "permission": return t.dictateErrorPermission ?? "Microphone permission denied.";
      case "no-speech": return t.dictateErrorNoSpeech ?? "No speech detected.";
      case "network": return t.dictateErrorNetwork ?? "Network error during dictation.";
      case "aborted": return t.dictateErrorAborted ?? "Dictation cancelled.";
      default: return t.dictateErrorOther ?? "Couldn't dictate.";
    }
  }

  function toggleDictation() {
    // Guard against concurrent instances: if one is already running (or a
    // start is in flight), stop it rather than layering a second recognizer.
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    const w = window as unknown as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return; // feature-detected already; button is disabled in this case
    setDictationError(null);
    const rec = new Ctor();
    // es-DO is the locale contract for Spanish dictation; browsers without an
    // exact es-DO voice model fall back to their closest es-* recognizer —
    // that fallback is entirely browser-side, nothing to do here.
    rec.lang = lang === "es" ? "es-DO" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const transcripts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) transcripts.push(ev.results[i][0].transcript);
      if (textRef.current) {
        textRef.current.value = mergeTranscript(textRef.current.value, transcripts.join(" "));
      }
    };
    const finish = () => { recRef.current = null; setListening(false); };
    rec.onend = finish;
    rec.onerror = (ev) => {
      setDictationError(dictationErrorMessage(classifyDictationError(ev.error)));
      finish();
    };
    try {
      rec.start();
    } catch {
      // start() can throw synchronously (e.g. a previous session hasn't fully
      // torn down yet). Never report "listening" for a session that never began.
      recRef.current = null;
      setDictationError(dictationErrorMessage("other"));
      return;
    }
    recRef.current = rec;
    setListening(true);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card" style={{ padding: 16, marginBottom: 28 }}>
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
      <textarea ref={textRef} name="text" placeholder={t.placeholder} rows={3} className="input" style={{ marginBottom: 10, resize: "vertical" }} />
      {error && (
        <p role="alert" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {error}
        </p>
      )}
      {capture?.state.kind === "on-device" && (
        <p role="status" className="capture-notice is-on-device">{t.savedOnDevice}</p>
      )}
      {capture?.state.kind === "sealed" && (
        <p role="status" className="capture-notice is-sealed">{t.savedSealed}</p>
      )}
      {capture?.state.kind === "failed" && (
        <p role="alert" className="capture-notice is-failed">
          {[t.savedFailed, syncErrorText(capture.state.item, syncErrors)].filter(Boolean).join(": ")}
          <span className="capture-notice-hint">{t.savedFailedHint}</span>
        </p>
      )}
      {dictationError && (
        <p role="alert" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {dictationError}
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
        <input type="datetime-local" name="reminderDueAt" min={reminderMin} className="input" style={{ width: 190 }} />
        </label>
        <button
          type="button"
          onClick={toggleDictation}
          disabled={!speechSupported}
          title={!speechSupported ? (t.dictateUnsupported ?? "Dictation not supported") : undefined}
          className="btn btn-ghost"
          aria-label={!speechSupported ? (t.dictateUnsupported ?? "Dictation not supported") : listening ? (t.listening ?? "Listening…") : (t.dictate ?? "Dictate")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Mic size={14} />
          {listening ? (t.listening ?? "Listening…") : (t.dictate ?? "Dictate")}
        </button>
        {!speechSupported && (
          <span className="mono text-steel" style={{ fontSize: "0.66rem" }}>{t.dictateUnsupported ?? "Dictation not supported"}</span>
        )}
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/webm" style={{ maxWidth: 220 }} />
        <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{coords ? t.gpsOk : t.gps}</span>
        <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-ink" style={{ marginLeft: "auto" }}>
          {pending ? t.sending : <>{t.submit} <span className="arrow">→</span></>}
        </button>
      </div>
    </form>
  );
}
