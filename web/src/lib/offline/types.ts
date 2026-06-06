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
  status: "pending" | "syncing" | "error";
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
