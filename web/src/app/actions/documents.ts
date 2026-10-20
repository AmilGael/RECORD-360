"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { DocumentKind } from "@prisma/client";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { canAccessProject, projectAccessWhere, requireProjectStructureAccess } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";
import { GENERATED_KEY_RE, verifyImageThumbGrant, verifyUploadGrant } from "@/lib/uploads/grant";
import type { AttachmentType } from "@prisma/client";
import { attachmentKindForType, contentTypeForKey } from "@/lib/storage/mime";
import { sanitizeFileName } from "@/lib/storage/filename";

export type DocResult = { ok: true } | { ok: false; error: string };

const DOCUMENT_KINDS: DocumentKind[] = ["PLANO", "DOCUMENTO", "LEVANTAMIENTO", "IDEA", "MINUTA", "PLANO_ACTUALIZADO"];
const ATTACHMENT_TYPES: AttachmentType[] = ["IMAGE", "PDF", "VIDEO", "AUDIO"];
const THUMB_MAX_BYTES = 2 * 1024 * 1024;

function parseDocumentKind(raw: unknown): DocumentKind {
  const v = String(raw ?? "PLANO");
  return DOCUMENT_KINDS.includes(v as DocumentKind) ? (v as DocumentKind) : "PLANO";
}

async function storeFallbackThumb(raw: FormDataEntryValue | null): Promise<string | null> {
  if (!(raw instanceof File) || raw.size === 0 || raw.size > THUMB_MAX_BYTES) return null;
  const kind = attachmentKindForType(raw.type);
  if (kind !== "IMAGE") return null;
  try {
    const buffer = Buffer.from(await raw.arrayBuffer());
    const saved = await storage.put({ buffer, filename: raw.name, contentType: raw.type });
    return saved.key;
  } catch {
    return null;
  }
}

function readThumbGrant(formData: FormData): { key: string; fileType: string; exp: number; token: string } | null {
  const key = String(formData.get("thumbKey") ?? "").trim();
  const fileType = String(formData.get("thumbFileType") ?? "").trim();
  const token = String(formData.get("thumbToken") ?? "").trim();
  const expRaw = formData.get("thumbExp");
  if (!key && !fileType && !token && (expRaw == null || String(expRaw) === "")) return null;
  return { key, fileType, exp: Number(expRaw), token };
}

export async function createDocument(_prev: DocResult | null, formData: FormData): Promise<DocResult> {
  try {
    const user = await requireFreshSession();

    const projectId = String(formData.get("projectId"));
    if (!(await canAccessProject({ id: user.id, companyId: user.companyId, role: user.role }, projectId))) return { ok: false, error: "No autorizado." };
    const segmentRaw = formData.get("segmentId");
    const segmentId = typeof segmentRaw === "string" && segmentRaw.trim() ? segmentRaw.trim() : null;
    if (segmentId) {
      const segment = await prisma.segment.findFirst({ where: { id: segmentId, projectId }, select: { id: true } });
      if (!segment) return { ok: false, error: "Bloque inválido." };
    }

    const title = (String(formData.get("title") ?? "").trim()) || null;
    const kind = parseDocumentKind(formData.get("kind"));
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    const prepared = await prepareAttachments(files, storage);
    if (prepared.length === 0) return { ok: false, error: "Selecciona un archivo." };

    const thumbKey = prepared.length === 1 ? await storeFallbackThumb(formData.get("thumb")) : null;

    await prisma.document.createMany({
      data: prepared.map((a, i) => ({
        projectId, segmentId, kind, title,
        fileName: sanitizeFileName(files[i]?.name ?? ""),
        url: a.url, sha256: a.sha256, fileType: a.fileType,
        thumbKey,
        uploadedById: user.id!,
      })),
    });
    revalidatePath(`/app/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}

/**
 * Finalize a direct-to-storage upload (see /api/uploads/presign): the file is
 * already in the bucket; this only records the Document row. The HMAC grant
 * proves the key was presigned for THIS user, so a client can't register (and
 * thereby gain /api/media access to) an object it didn't upload. The sha256 is
 * client-computed and informational — documents don't join the registro
 * integrity chain. thumbKey is presentation only and never replaces url/sha256.
 */
export async function registerDocument(_prev: DocResult | null, formData: FormData): Promise<DocResult> {
  try {
    const user = await requireFreshSession();

    const projectId = String(formData.get("projectId"));
    if (!(await canAccessProject({ id: user.id, companyId: user.companyId, role: user.role }, projectId))) return { ok: false, error: "No autorizado." };
    const segmentRaw = formData.get("segmentId");
    const segmentId = typeof segmentRaw === "string" && segmentRaw.trim() ? segmentRaw.trim() : null;
    if (segmentId) {
      const segment = await prisma.segment.findFirst({ where: { id: segmentId, projectId }, select: { id: true } });
      if (!segment) return { ok: false, error: "Bloque inválido." };
    }

    const title = (String(formData.get("title") ?? "").trim()) || null;
    const kind = parseDocumentKind(formData.get("kind"));
    const key = String(formData.get("key") ?? "");
    const fileTypeRaw = String(formData.get("fileType") ?? "");
    const exp = Number(formData.get("exp"));
    const token = String(formData.get("token") ?? "");
    const sha256 = String(formData.get("sha256") ?? "").toLowerCase();
    const fileName = sanitizeFileName(String(formData.get("fileName") ?? ""));

    const fileType = ATTACHMENT_TYPES.includes(fileTypeRaw as AttachmentType) ? (fileTypeRaw as AttachmentType) : null;
    if (!fileType || !GENERATED_KEY_RE.test(key) || !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, error: "Solicitud inválida." };
    // The stored extension must map back to an allowed type — media serving
    // derives Content-Type from it.
    if (!contentTypeForKey(key)) return { ok: false, error: "Solicitud inválida." };
    if (!verifyUploadGrant(user.id, { key, fileType, exp, token })) return { ok: false, error: "No autorizado." };

    const thumb = readThumbGrant(formData);
    let thumbKey: string | null = null;
    if (thumb) {
      if (!verifyImageThumbGrant(user.id, thumb)) return { ok: false, error: "No autorizado." };
      thumbKey = thumb.key;
    }

    await prisma.document.create({
      data: { projectId, segmentId, kind, title, fileName, url: `/api/media/${key}`, sha256, fileType, thumbKey, uploadedById: user.id! },
    });
    revalidatePath(`/app/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}

/**
 * Attach a miniature to a Document that does not yet have one. Atomic: an
 * existing thumbKey is never overwritten. Presentation only — url/sha256 stay.
 * Does not revalidate: the backfill loop would remount and abort on each write.
 */
export async function setDocumentThumbnail(_prev: DocResult | null, formData: FormData): Promise<DocResult> {
  try {
    const user = await requireFreshSession();
    const sessionUser = { id: user.id, companyId: user.companyId, role: user.role };
    const documentId = String(formData.get("documentId") ?? "");
    const doc = await prisma.document.findFirst({
      where: { id: documentId, project: projectAccessWhere(sessionUser) },
      select: { id: true, projectId: true },
    });
    if (!doc) return { ok: false, error: "No autorizado." };
    await requireProjectStructureAccess(sessionUser, doc.projectId);

    const grant = readThumbGrant(formData);
    let thumbKey: string | null = null;
    if (grant) {
      if (!verifyImageThumbGrant(user.id, grant)) return { ok: false, error: "No autorizado." };
      thumbKey = grant.key;
    } else {
      thumbKey = await storeFallbackThumb(formData.get("thumb"));
    }
    if (!thumbKey) return { ok: false, error: "Solicitud inválida." };

    await prisma.document.updateMany({
      where: { id: doc.id, thumbKey: null },
      data: { thumbKey },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}
