import { openDB, type IDBPDatabase } from "idb";
import type { OfflineQueue, QueuedRegistro } from "./types";

const STORE = "registros";

export class IndexedDbQueue implements OfflineQueue {
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName = "raphl-offline") {
    this.dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("partidaId", "partidaId");
      },
    });
  }

  private db() {
    return this.dbPromise;
  }

  async enqueue(item: QueuedRegistro) {
    await (await this.db()).put(STORE, item);
  }

  async all() {
    return (await (await this.db()).getAll(STORE)) as QueuedRegistro[];
  }

  async forPartida(partidaId: string) {
    return (await (await this.db()).getAllFromIndex(
      STORE,
      "partidaId",
      partidaId,
    )) as QueuedRegistro[];
  }

  async update(id: string, patch: Partial<QueuedRegistro>) {
    const db = await this.db();
    const cur = (await db.get(STORE, id)) as QueuedRegistro | undefined;
    if (cur) await db.put(STORE, { ...cur, ...patch });
  }

  async remove(id: string) {
    await (await this.db()).delete(STORE, id);
  }

  async pendingCount() {
    return (await this.all()).filter((i) => i.status !== "syncing").length;
  }
}

// Test/SSR-safe in-memory implementation.
export class InMemoryQueue implements OfflineQueue {
  private map = new Map<string, QueuedRegistro>();

  async enqueue(i: QueuedRegistro) {
    this.map.set(i.id, i);
  }

  async all() {
    return [...this.map.values()];
  }

  async forPartida(p: string) {
    return [...this.map.values()].filter((i) => i.partidaId === p);
  }

  async update(id: string, patch: Partial<QueuedRegistro>) {
    const c = this.map.get(id);
    if (c) this.map.set(id, { ...c, ...patch });
  }

  async remove(id: string) {
    this.map.delete(id);
  }

  async pendingCount() {
    return [...this.map.values()].filter((i) => i.status !== "syncing").length;
  }
}
