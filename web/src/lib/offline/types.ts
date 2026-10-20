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
  // ISO with Z (converted from the device clock at capture) or null. Entries
  // queued by older builds hold an offset-less datetime-local value instead;
  // the server reads those as wall time in APP_TIME_ZONE.
  reminderDueAt: string | null;
  clientCapturedAt: string;         // ISO, set at capture
  attachments: QueuedAttachment[];
  // "blocked": session expired (401) — needs the user to log back in; the
  // offline provider retries automatically after the next successful login/app
  // load. "error" stays TERMINAL — a 403 (no project access) or 400 (rejected
  // by the server, e.g. bad reminder) that a retry cannot fix without the user
  // changing something. Old persisted records only ever used "error"; they
  // remain valid values (no migration needed for IndexedDB-stored rows).
  status: "pending" | "syncing" | "blocked" | "error";
  // New failures store a code the UI maps to the user's language. `error` is
  // legacy text only: items queued by older builds, with no errorCode.
  errorCode?: SyncErrorCode;
  error?: string;
  attempts: number;
}

export const SYNC_ERROR_CODES = [
  "session_expired",
  "forbidden",
  "generic",
  "reminder_invalid",
  "reminder_future",
  "location_too_long",
  "category_invalid",
  "file_type",
  "file_too_big",
  "file_too_many",
  "file_total",
  "file_save",
  "correction_target",
  "reply_target",
  "captured_at",
] as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export function isSyncErrorCode(value: unknown): value is SyncErrorCode {
  return typeof value === "string" && (SYNC_ERROR_CODES as readonly string[]).includes(value);
}

export interface OfflineQueue {
  enqueue(item: QueuedRegistro): Promise<void>;
  forPartida(partidaId: string): Promise<QueuedRegistro[]>;
  all(): Promise<QueuedRegistro[]>;
  update(id: string, patch: Partial<QueuedRegistro>): Promise<void>;
  remove(id: string): Promise<void>;
  pendingCount(): Promise<number>;
}
