import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbQueue } from "@/lib/offline/queue";
import type { QueuedRegistro } from "@/lib/offline/types";

function item(id: string, partidaId = "p1"): QueuedRegistro {
  return {
    id,
    partidaId,
    text: "x",
    category: null,
    gpsLat: null,
    gpsLng: null,
    locationLabel: null,
    correctionOfId: null,
    replyToId: null,
    reminderDueAt: null,
    clientCapturedAt: new Date().toISOString(),
    attachments: [
      { blob: new Blob(["abc"], { type: "image/png" }), filename: "a.png", contentType: "image/png" },
    ],
    status: "pending",
    attempts: 0,
  };
}

describe("IndexedDbQueue", () => {
  let q: IndexedDbQueue;
  beforeEach(async () => {
    (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
    q = new IndexedDbQueue(`t-${Math.random()}`);
  });

  it("enqueues and reads back (blob round-trips)", async () => {
    await q.enqueue(item("a"));
    const all = await q.all();
    expect(all).toHaveLength(1);
    expect(await all[0].attachments[0].blob.text()).toBe("abc");
  });

  it("filters by partida", async () => {
    await q.enqueue(item("a", "p1"));
    await q.enqueue(item("b", "p2"));
    expect(await q.forPartida("p2")).toHaveLength(1);
  });

  it("updates and removes", async () => {
    await q.enqueue(item("a"));
    await q.update("a", { status: "error", error: "boom", attempts: 2 });
    expect((await q.all())[0].error).toBe("boom");
    await q.remove("a");
    expect(await q.all()).toHaveLength(0);
  });

  it("pendingCount counts pending + error (not syncing)", async () => {
    await q.enqueue(item("a"));
    await q.enqueue({ ...item("b"), status: "error" });
    await q.enqueue({ ...item("c"), status: "syncing" });
    expect(await q.pendingCount()).toBe(2);
  });
});
