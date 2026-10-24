import { storage } from "@/lib/storage";
import { attachmentKindForType } from "@/lib/storage/mime";
import { SIZE_CAP } from "@/lib/registro/upload";
import { issueUploadGrant } from "@/lib/uploads/grant";
import { requireFreshSession } from "@/lib/auth/session";
import { getDict } from "@/i18n/server";

// Netlify buffers function request bodies at ~6 MB (≈4.4 MB effective after
// encoding), so any upload routed through a server action 413s before the app
// runs — far below the app's own per-type caps. This route lets the browser
// upload straight to object storage instead: it validates type + size, has the
// storage driver presign a PUT, and issues an HMAC grant that the finalize
// action (registerDocument) requires before it will record the key. When the
// driver can't presign (local disk in dev), the client falls back to the
// server-action path, which has no platform ceiling locally.

export async function POST(req: Request) {
  const { t } = await getDict();
  let user;
  try {
    user = await requireFreshSession();
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "Forbidden";
    return Response.json({ error: t.serverErrors.unauthorized }, { status: forbidden ? 403 : 401 });
  }

  let contentType = "", size = NaN;
  try {
    const body = (await req.json()) as { contentType?: unknown; size?: unknown };
    contentType = String(body.contentType ?? "");
    size = Number(body.size);
  } catch {
    return Response.json({ error: t.serverErrors.invalidRequest }, { status: 400 });
  }

  const kind = attachmentKindForType(contentType);
  if (!kind) return Response.json({ error: t.serverErrors.fileType }, { status: 415 });
  if (!Number.isInteger(size) || size <= 0) return Response.json({ error: t.serverErrors.invalidRequest }, { status: 400 });
  if (size > SIZE_CAP[kind]) return Response.json({ error: t.serverErrors.fileTooBig }, { status: 413 });

  if (typeof storage.presignPut !== "function") return Response.json({ direct: false });

  const { url, key } = await storage.presignPut({ contentType, size });
  const grant = issueUploadGrant(user.id, key, kind);
  return Response.json({ direct: true, url, key, fileType: grant.fileType, exp: grant.exp, token: grant.token });
}
