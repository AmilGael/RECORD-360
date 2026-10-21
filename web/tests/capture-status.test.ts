import { describe, expect, it } from "vitest";
import { nextCaptureState, syncErrorText, type CaptureState } from "@/lib/offline/capture-status";
import type { QueuedRegistro } from "@/lib/offline/types";

const labels = { sessionExpired: "Session expired.", forbidden: "No access." };

const item = (id: string, patch: Partial<QueuedRegistro> = {}): QueuedRegistro => ({
  id, partidaId: "p", text: "x", category: null, gpsLat: null, gpsLng: null, locationLabel: null,
  correctionOfId: null, replyToId: null, reminderDueAt: null, clientCapturedAt: new Date().toISOString(),
  attachments: [], status: "pending", attempts: 0, ...patch,
});

describe("syncErrorText", () => {
  it("maps the client-made codes to the given language", () => {
    expect(syncErrorText({ errorCode: "session_expired" }, labels)).toBe("Session expired.");
    expect(syncErrorText({ errorCode: "forbidden" }, labels)).toBe("No access.");
  });
  it("shows the server's validation message as sent", () => {
    expect(syncErrorText({ error: "La fecha del recordatorio no es válida." }, labels)).toBe("La fecha del recordatorio no es válida.");
  });
  it("renders a legacy item's stored text as-is when it has no code", () => {
    expect(syncErrorText({ error: "Sin acceso al proyecto." }, labels)).toBe("Sin acceso al proyecto.");
  });
  it("prefers the code over any stored text", () => {
    expect(syncErrorText({ errorCode: "forbidden", error: "Sin acceso al proyecto." }, labels)).toBe("No access.");
  });
  it("is empty when there is nothing to show", () => {
    expect(syncErrorText({}, labels)).toBe("");
  });
});

describe("nextCaptureState", () => {
  const onDevice: CaptureState = { kind: "on-device" };

  it("stays on the device while the item is queued or syncing", () => {
    expect(nextCaptureState(onDevice, "a", [item("a")])).toEqual({ kind: "on-device" });
    expect(nextCaptureState(onDevice, "a", [item("a", { status: "syncing" })])).toEqual({ kind: "on-device" });
  });
  it("never infers a seal from the item leaving the queue", () => {
    expect(nextCaptureState(onDevice, "a", [item("b")])).toEqual({ kind: "gone" });
    expect(nextCaptureState(onDevice, "a", [])).toEqual({ kind: "gone" });
  });
  it("keeps a seal against a stale queue read that still holds the item", () => {
    expect(nextCaptureState({ kind: "sealed" }, "a", [item("a", { status: "syncing" })])).toEqual({ kind: "sealed" });
    expect(nextCaptureState({ kind: "sealed" }, "a", [])).toEqual({ kind: "sealed" });
  });
  it("fails with the item when the server blocks or rejects it", () => {
    const blocked = item("a", { status: "blocked", errorCode: "session_expired" });
    expect(nextCaptureState(onDevice, "a", [blocked])).toEqual({ kind: "failed", item: blocked });
    const rejected = item("a", { status: "error", error: "malo" });
    expect(nextCaptureState(onDevice, "a", [rejected])).toEqual({ kind: "failed", item: rejected });
  });
  it("never claims sealed for an item that failed and then left (discarded)", () => {
    const failed: CaptureState = { kind: "failed", item: item("a", { status: "error" }) };
    expect(nextCaptureState(failed, "a", [])).toEqual({ kind: "gone" });
    expect(nextCaptureState({ kind: "gone" }, "a", [])).toEqual({ kind: "gone" });
  });
  it("follows a retried item back to the device", () => {
    const failed: CaptureState = { kind: "failed", item: item("a", { status: "error" }) };
    expect(nextCaptureState(failed, "a", [item("a")])).toEqual({ kind: "on-device" });
  });
  it("covers the offline sequence: queued, still queued after a failed attempt", () => {
    let s: CaptureState = onDevice;
    s = nextCaptureState(s, "a", [item("a")]);
    s = nextCaptureState(s, "a", [item("a", { attempts: 1 })]);
    expect(s).toEqual({ kind: "on-device" });
  });
});
