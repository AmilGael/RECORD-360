import { describe, expect, it } from "vitest";
import { nextCaptureState, syncErrorText, type CaptureState, type SyncErrorLabels } from "@/lib/offline/capture-status";
import { SYNC_ERROR_CODES, type QueuedRegistro } from "@/lib/offline/types";

const labels = Object.fromEntries(SYNC_ERROR_CODES.map((code) => [code, code])) as SyncErrorLabels;
labels.session_expired = "Session expired.";
labels.forbidden = "No access.";

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
  it("maps a stored code to its label", () => {
    expect(syncErrorText({ errorCode: "reminder_future" }, labels)).toBe("reminder_future");
  });
  it("shows a legacy row's stored text when it has no code", () => {
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
  it("is sealed once the item leaves the queue", () => {
    expect(nextCaptureState(onDevice, "a", [item("b")])).toEqual({ kind: "sealed" });
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
  it("follows a retried item back to the device and then to sealed", () => {
    const failed: CaptureState = { kind: "failed", item: item("a", { status: "error" }) };
    const retried = nextCaptureState(failed, "a", [item("a")]);
    expect(retried).toEqual({ kind: "on-device" });
    expect(nextCaptureState(retried, "a", [])).toEqual({ kind: "sealed" });
  });
  it("covers the offline sequence: queued, still queued after a failed attempt, then accepted", () => {
    let s: CaptureState = onDevice;
    s = nextCaptureState(s, "a", [item("a")]);
    s = nextCaptureState(s, "a", [item("a", { attempts: 1 })]);
    expect(s).toEqual({ kind: "on-device" });
    s = nextCaptureState(s, "a", []);
    expect(s).toEqual({ kind: "sealed" });
  });
});
