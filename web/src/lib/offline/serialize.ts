import type { QueuedRegistro } from "./types";

export function toFormData(item: QueuedRegistro): FormData {
  const fd = new FormData();
  fd.set("partidaId", item.partidaId);
  fd.set("idempotencyKey", item.id);
  fd.set("clientCapturedAt", item.clientCapturedAt);
  if (item.text) fd.set("text", item.text);
  if (item.category) fd.set("category", item.category);
  if (item.gpsLat != null) fd.set("gpsLat", String(item.gpsLat));
  if (item.gpsLng != null) fd.set("gpsLng", String(item.gpsLng));
  if (item.locationLabel) fd.set("location", item.locationLabel);
  if (item.correctionOfId) fd.set("correctionOfId", item.correctionOfId);
  if (item.replyToId) fd.set("replyToId", item.replyToId);
  if (item.reminderDueAt) fd.set("reminderDueAt", item.reminderDueAt);
  for (const a of item.attachments) fd.append("photos", a.blob, a.filename);
  return fd;
}
