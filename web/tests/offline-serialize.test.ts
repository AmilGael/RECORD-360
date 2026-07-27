import { describe, expect, it } from "vitest";
import { toFormData } from "@/lib/offline/serialize";
import type { QueuedRegistro } from "@/lib/offline/types";

const base: QueuedRegistro = {
  id: "q1", partidaId: "p1", text: "hola", category: null,
  gpsLat: null, gpsLng: null, locationLabel: null, correctionOfId: null, replyToId: null,
  reminderDueAt: null, clientCapturedAt: "2026-06-01T14:03:00.000Z",
  attachments: [], status: "pending", attempts: 0,
};

describe("toFormData — reminder + clientCapturedAt round-trip", () => {
  it("always includes clientCapturedAt, even without a reminder", () => {
    const fd = toFormData(base);
    expect(fd.get("clientCapturedAt")).toBe("2026-06-01T14:03:00.000Z");
    expect(fd.has("reminderDueAt")).toBe(false);
  });

  it("carries reminderDueAt through unchanged alongside clientCapturedAt", () => {
    const item: QueuedRegistro = { ...base, reminderDueAt: "2026-06-01T14:05:00.000Z" };
    const fd = toFormData(item);
    expect(fd.get("reminderDueAt")).toBe("2026-06-01T14:05:00.000Z");
    expect(fd.get("clientCapturedAt")).toBe("2026-06-01T14:03:00.000Z");
    expect(fd.get("partidaId")).toBe("p1");
    expect(fd.get("idempotencyKey")).toBe("q1");
  });

  it("omits a null reminderDueAt rather than sending an empty/garbage value", () => {
    const fd = toFormData(base);
    expect(fd.get("reminderDueAt")).toBeNull();
  });
});
