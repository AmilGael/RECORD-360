"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import type { DocumentKind } from "@prisma/client";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { canAccessProject } from "@/lib/authz/projects";

export type DocResult = { ok: true } | { ok: false; error: string };

const DOCUMENT_KINDS: DocumentKind[] = ["PLANO", "DOCUMENTO", "LEVANTAMIENTO", "IDEA", "MINUTA", "PLANO_ACTUALIZADO"];

function parseDocumentKind(raw: unknown): DocumentKind {
  const v = String(raw ?? "PLANO");
  return DOCUMENT_KINDS.includes(v as DocumentKind) ? (v as DocumentKind) : "PLANO";
}

export async function createDocument(_prev: DocResult | null, formData: FormData): Promise<DocResult> {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
    if (!user?.id || !user.companyId || !user.role) return { ok: false, error: "No autorizado." };

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
