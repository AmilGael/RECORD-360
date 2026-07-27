export interface QueuedAttachment {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface QueuedRegistro {
  id: string;                   // client UUID == idempotencyKey
  partidaId: string;
  text: string | null;
  category: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  locationLabel: string | null;     // upserted server-side on sync
  correctionOfId: string | null;    // synced (server) ids only
  replyToId: string | null;
  reminderDueAt: string | null;     // ISO or null
  clientCapturedAt: string;         // ISO, set at capture
  attachments: QueuedAttachment[];
  // "blocked": session expired (401) — needs the user to log back in; the
  // offline provider retries automatically after the next successful login/app
  // load. "error" stays TERMINAL — a 403 (no project access) or 400 (rejected
  // by the server, e.g. bad reminder) that a retry cannot fix without the user
  // changing something. Old persisted records only ever used "error"; they
  // remain valid values (no migration needed for IndexedDB-stored rows).
  status: "pending" | "syncing" | "blocked" | "error";
  error?: string;
  attempts: number;
}

export interface OfflineQueue {
  enqueue(item: QueuedRegistro): Promise<void>;
  forPartida(partidaId: string): Promise<QueuedRegistro[]>;
  all(): Promise<QueuedRegistro[]>;
  update(id: string, patch: Partial<QueuedRegistro>): Promise<void>;
  remove(id: string): Promise<void>;
  pendingCount(): Promise<number>;
}
