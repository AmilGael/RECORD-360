import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryQueue } from "@/lib/offline/queue";
import { syncQueue } from "@/lib/offline/sync";
import type { QueuedRegistro } from "@/lib/offline/types";

const item = (id: string): QueuedRegistro => ({ id, partidaId: "p", text: "x", category: null,
  gpsLat: null, gpsLng: null, locationLabel: null, correctionOfId: null, replyToId: null,
  reminderDueAt: null, clientCapturedAt: new Date().toISOString(), attachments: [], status: "pending", attempts: 0 });

const ok = () => Promise.resolve(new Response(JSON.stringify({ id: "srv" }), { status: 200 }));

describe("syncQueue", () => {
  let q: InMemoryQueue;
  beforeEach(() => { q = new InMemoryQueue(); });

  it("removes items on 2xx", async () => {
    await q.enqueue(item("a"));
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => true });
    expect(await q.all()).toHaveLength(0);
  });
  it("keeps + counts attempts on network error", async () => {
    await q.enqueue(item("a"));
    const fail = () => Promise.reject(new Error("offline"));
    await syncQueue({ queue: q, fetchFn: fail, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("pending"); expect(it0.attempts).toBe(1);
  });
  it("marks error (no retry) on 4xx", async () => {
    await q.enqueue(item("a"));
    const bad = () => Promise.resolve(new Response(JSON.stringify({ error: "malo" }), { status: 400 }));
    await syncQueue({ queue: q, fetchFn: bad, isOnline: () => true });
    expect((await q.all())[0].status).toBe("error");
  });
  it("marks 'sesión expirada' on 401", async () => {
    await q.enqueue(item("a"));
    const un = () => Promise.resolve(new Response("", { status: 401 }));
    await syncQueue({ queue: q, fetchFn: un, isOnline: () => true });
    expect((await q.all())[0].error).toMatch(/sesión/i);
  });
  it("does nothing when offline", async () => {
    await q.enqueue(item("a"));
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => false });
    expect(await q.all()).toHaveLength(1);
  });
});
