"use client";
import { useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic } from "@/components/icons";
import { IndexedDbQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";
import type { QueuedRegistro } from "@/lib/offline/types";
import type { Lang } from "@/i18n/dictionaries";

// Minimal structural type for the Web Speech API recogniser — avoids `any`.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { length: number; [i: number]: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
  saved?: string;
  categories: Record<string, string>;
};

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
  partidaId, t, locations, correction, reply, lang,
}: {
  partidaId: string;
  t: ComposerT;
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
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as WindowWithSpeech;
    setSpeechSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

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
      reminderDueAt: (String(fd.get("reminderDueAt") ?? "").trim()) || null,
      clientCapturedAt: new Date().toISOString(),
      attachments: files.map((f) => ({ blob: f, filename: f.name, contentType: f.type })),
      status: "pending",
      attempts: 0,
    };
    setPending(true);
    try {
      await getQueue().enqueue(item);
      form.reset();
      setSaved(true);
      emitQueueChanged();
      // Background sync; refresh the feed when it settles (no-op if offline).
      void syncQueue({ queue: getQueue(), onChange: emitQueueChanged }).then(() => router.refresh());
      if (correction || reply) router.replace(`/app/partidas/${partidaId}`);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 4000);
    } catch {
      setError(t.error);
    } finally {
      setPending(false);
    }
  }

  function toggleDictation() {
    if (listening && recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    const w = window as unknown as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang === "es" ? "es-DO" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const transcripts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) transcripts.push(ev.results[i][0].transcript);
      const appended = transcripts.join(" ");
      if (textRef.current) {
        const existing = textRef.current.value;
        textRef.current.value = existing ? `${existing} ${appended}` : appended;
      }
    };
    const finish = () => { recRef.current = null; setListening(false); };
    rec.onend = finish;
    rec.onerror = finish;
    recRef.current = rec;
    rec.start();
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
        <p role="alert" style={{ background: "rgba(225,74,31,0.08)", border: "1px solid var(--accent)", color: "var(--accent-deep)", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {error}
        </p>
      )}
      {saved && (
        <p role="status" style={{ background: "rgba(46,125,50,0.08)", border: "1px solid #2e7d32", color: "#2e7d32", padding: "8px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.84rem", marginBottom: 10 }}>
          {t.saved ?? "Guardado."}
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
        <input type="datetime-local" name="reminderDueAt" min={new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} className="input" style={{ width: 190 }} />
        </label>
        {speechSupported && (
          <button type="button" onClick={toggleDictation} className="btn btn-ghost" aria-label={listening ? (t.listening ?? "Listening…") : (t.dictate ?? "Dictate")} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Mic size={14} />
            {listening ? (t.listening ?? "Listening…") : (t.dictate ?? "Dictate")}
          </button>
        )}
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/webm" style={{ fontSize: "0.8rem", maxWidth: 220 }} />
        <span className="mono text-steel" style={{ fontSize: "0.72rem" }}>{coords ? t.gpsOk : t.gps}</span>
        <button type="submit" disabled={pending} className="btn btn-ink" style={{ marginLeft: "auto" }}>
          {pending ? t.sending : <>{t.submit} <span className="arrow">→</span></>}
        </button>
      </div>
    </form>
  );
}
