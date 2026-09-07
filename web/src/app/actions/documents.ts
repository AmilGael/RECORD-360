"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { DocumentKind } from "@prisma/client";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { canAccessProject } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";
import { verifyUploadGrant } from "@/lib/uploads/grant";
import type { AttachmentType } from "@prisma/client";
import { contentTypeForKey } from "@/lib/storage/mime";

export type DocResult = { ok: true } | { ok: false; error: string };

const DOCUMENT_KINDS: DocumentKind[] = ["PLANO", "DOCUMENTO", "LEVANTAMIENTO", "IDEA", "MINUTA", "PLANO_ACTUALIZADO"];

function parseDocumentKind(raw: unknown): DocumentKind {
  const v = String(raw ?? "PLANO");
  return DOCUMENT_KINDS.includes(v as DocumentKind) ? (v as DocumentKind) : "PLANO";
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
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    const prepared = await prepareAttachments(files, storage);
    if (prepared.length === 0) return { ok: false, error: "Selecciona un archivo." };

    await prisma.document.createMany({
      data: prepared.map((a) => ({
        projectId, segmentId, kind, title,
        url: a.url, sha256: a.sha256, fileType: a.fileType, uploadedById: user.id!,
      })),
    });
    revalidatePath(`/app/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}

// Object keys are minted server-side as `${randomUUID()}${ext}` — anything else
// was never issued by our presign route and is rejected before the grant check.
const GENERATED_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;
const ATTACHMENT_TYPES: AttachmentType[] = ["IMAGE", "PDF", "VIDEO", "AUDIO"];

/**
 * Finalize a direct-to-storage upload (see /api/uploads/presign): the file is
 * already in the bucket; this only records the Document row. The HMAC grant
 * proves the key was presigned for THIS user, so a client can't register (and
 * thereby gain /api/media access to) an object it didn't upload. The sha256 is
 * client-computed and informational — documents don't join the registro
 * integrity chain.
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

    const fileType = ATTACHMENT_TYPES.includes(fileTypeRaw as AttachmentType) ? (fileTypeRaw as AttachmentType) : null;
    if (!fileType || !GENERATED_KEY_RE.test(key) || !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, error: "Solicitud inválida." };
    // The stored extension must map back to an allowed type — media serving
    // derives Content-Type from it.
    if (!contentTypeForKey(key)) return { ok: false, error: "Solicitud inválida." };
    if (!verifyUploadGrant(user.id, { key, fileType, exp, token })) return { ok: false, error: "No autorizado." };

    await prisma.document.create({
      data: { projectId, segmentId, kind, title, url: `/api/media/${key}`, sha256, fileType, uploadedById: user.id! },
    });
    revalidatePath(`/app/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir." };
  }
}
