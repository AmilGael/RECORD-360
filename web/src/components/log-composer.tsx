"use client";
import { useRef, useState } from "react";
import { logRegistro } from "@/app/actions/registro";

export function LogComposer({ partidaId }: { partidaId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  function captureGps() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
    );
  }

  return (
    <form ref={formRef} action={async (fd) => { await logRegistro(fd); formRef.current?.reset(); setCoords(null); }}
      style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 16, marginBottom: 28 }}>
      <input type="hidden" name="partidaId" value={partidaId} />
      <input type="hidden" name="gpsLat" value={coords?.lat ?? ""} />
      <input type="hidden" name="gpsLng" value={coords?.lng ?? ""} />
      <textarea name="text" placeholder="Describe lo que pasó en obra…" rows={3}
        style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 3, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" />
        <input type="number" name="progressPct" min={0} max={100} placeholder="Avance %"
          style={{ width: 110, padding: 8, border: "1px solid var(--line)", borderRadius: 3 }} />
        <button type="button" onClick={captureGps} style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 3, background: "none", cursor: "pointer" }}>
          {coords ? "GPS ✓" : "Capturar GPS"}
        </button>
        <button type="submit" style={{ marginLeft: "auto", padding: "9px 18px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 3, fontWeight: 700 }}>
          Registrar →
        </button>
      </div>
    </form>
  );
}
