import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryQueue } from "@/lib/offline/queue";
import { shouldRefreshAfterSync, syncQueue } from "@/lib/offline/sync";
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
  it("marks error (terminal, no retry) on 400 with the server's message", async () => {
    await q.enqueue(item("a"));
    const bad = () => Promise.resolve(new Response(JSON.stringify({ error: "malo" }), { status: 400 }));
    await syncQueue({ queue: q, fetchFn: bad, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("error");
    expect(it0.error).toBe("malo");
  });
  it("marks 'blocked' (not terminal error) on 401, with a session-expired message", async () => {
    await q.enqueue(item("a"));
    const un = () => Promise.resolve(new Response("", { status: 401 }));
    await syncQueue({ queue: q, fetchFn: un, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("blocked");
    expect(it0.error).toMatch(/sesión/i);
  });
  it("marks terminal error 'sin acceso' on 403", async () => {
    await q.enqueue(item("a"));
    const forbidden = () => Promise.resolve(new Response("", { status: 403 }));
    await syncQueue({ queue: q, fetchFn: forbidden, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("error");
    expect(it0.error).toMatch(/sin acceso/i);
  });
  it("keeps + counts attempts as 'pending' on 5xx (retryable, not terminal)", async () => {
    await q.enqueue(item("a"));
    const down = () => Promise.resolve(new Response("", { status: 503 }));
    await syncQueue({ queue: q, fetchFn: down, isOnline: () => true });
    const [it0] = await q.all();
    expect(it0.status).toBe("pending");
    expect(it0.attempts).toBe(1);
  });
  it("does nothing when offline", async () => {
    await q.enqueue(item("a"));
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => false });
    expect(await q.all()).toHaveLength(1);
  });
  it("never re-sends items already in terminal 'error' state", async () => {
    await q.enqueue({ ...item("a"), status: "error", error: "Sin acceso al proyecto." });
    let calls = 0;
    const spy = () => { calls++; return ok(); };
    await syncQueue({ queue: q, fetchFn: spy, isOnline: () => true });
    expect(calls).toBe(0);
    const [it0] = await q.all();
    expect(it0.status).toBe("error");
    expect(it0.error).toBe("Sin acceso al proyecto.");
  });
  it("does not re-send 'blocked' items on an ordinary sync pass", async () => {
    await q.enqueue({ ...item("a"), status: "blocked", error: "Sesión expirada." });
    let calls = 0;
    const spy = () => { calls++; return ok(); };
    await syncQueue({ queue: q, fetchFn: spy, isOnline: () => true });
    expect(calls).toBe(0);
    expect((await q.all())[0].status).toBe("blocked");
  });
  it("re-sends 'blocked' items when retryBlocked is set (post-login kick)", async () => {
    await q.enqueue({ ...item("a"), status: "blocked", error: "Sesión expirada." });
    await syncQueue({ queue: q, fetchFn: ok, isOnline: () => true, retryBlocked: true });
    expect(await q.all()).toHaveLength(0);
  });
  it("leaves 'error' items alone even when retryBlocked is set", async () => {
    await q.enqueue({ ...item("a"), status: "error", error: "malo" });
    let calls = 0;
    const spy = () => { calls++; return ok(); };
    await syncQueue({ queue: q, fetchFn: spy, isOnline: () => true, retryBlocked: true });
    expect(calls).toBe(0);
    expect((await q.all())[0].status).toBe("error");
  });
  it("still re-sends mixed queue: pending yes, error no", async () => {
    await q.enqueue({ ...item("dead"), status: "error", error: "malo" });
    await q.enqueue(item("live"));
    const urls: string[] = [];
    const spy = (_: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String((init?.body as FormData).get("idempotencyKey")));
      return ok();
    };
    await syncQueue({ queue: q, fetchFn: spy as typeof fetch, isOnline: () => true });
    expect(urls).toEqual(["live"]);
    const rest = await q.all();
    expect(rest).toHaveLength(1);
    expect(rest[0].id).toBe("dead");
  });
});

describe("syncQueue result: { synced }", () => {
  let q: InMemoryQueue;
  beforeEach(() => { q = new InMemoryQueue(); });

  it("returns 0 when offline", async () => {
    await q.enqueue(item("a"));
    await expect(syncQueue({ queue: q, fetchFn: ok, isOnline: () => false })).resolves.toEqual({ synced: 0 });
  });
  it("returns 0 on a thrown fetch and leaves the item pending", async () => {
    await q.enqueue(item("a"));
    const fail = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(syncQueue({ queue: q, fetchFn: fail, isOnline: () => true })).resolves.toEqual({ synced: 0 });
    const [it0] = await q.all();
    expect(it0.status).toBe("pending");
  });
  it("returns 0 for an empty queue and for retryable 5xx", async () => {
    await expect(syncQueue({ queue: q, fetchFn: ok, isOnline: () => true })).resolves.toEqual({ synced: 0 });
    await q.enqueue(item("a"));
    const down = () => Promise.resolve(new Response("", { status: 503 }));
    await expect(syncQueue({ queue: q, fetchFn: down, isOnline: () => true })).resolves.toEqual({ synced: 0 });
  });
  it("counts only items the server accepted", async () => {
    await q.enqueue(item("a"));
    await q.enqueue(item("b"));
    await expect(syncQueue({ queue: q, fetchFn: ok, isOnline: () => true })).resolves.toEqual({ synced: 2 });
    await q.enqueue(item("c"));
    await q.enqueue(item("d"));
    let n = 0;
    const mixed = () => (++n === 1 ? ok() : Promise.resolve(new Response(JSON.stringify({ error: "malo" }), { status: 400 })));
    await expect(syncQueue({ queue: q, fetchFn: mixed, isOnline: () => true })).resolves.toEqual({ synced: 1 });
  });
});

describe("syncQueue: a capture queued while a pass is running", () => {
  it("is sent by the running pass and counted there", async () => {
    const q = new InMemoryQueue();
    await q.enqueue(item("a"));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const slow = async () => { if (++calls === 1) await gate; return ok(); };
    const first = syncQueue({ queue: q, fetchFn: slow, isOnline: () => true });
    await q.enqueue(item("b"));
    await expect(syncQueue({ queue: q, fetchFn: slow, isOnline: () => true })).resolves.toEqual({ synced: 0 });
    release();
    await expect(first).resolves.toEqual({ synced: 2 });
    expect(await q.all()).toHaveLength(0);
  });
});

describe("shouldRefreshAfterSync", () => {
  it("refreshes only when the server accepted something", () => {
    expect(shouldRefreshAfterSync({ synced: 0 })).toBe(false);
    expect(shouldRefreshAfterSync({ synced: 1 })).toBe(true);
    expect(shouldRefreshAfterSync({ synced: 3 })).toBe(true);
  });
});
