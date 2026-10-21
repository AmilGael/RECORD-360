/**
 * Browser PUT of a thumbnail through /api/uploads/presign. Failure returns
 * null so the caller can fall back to the server-action path (or skip).
 */

export type DirectGrant = { key: string; fileType: string; exp: number; token: string };

type PresignResponse =
  | { direct: false; error?: string }
  | { direct: true; url: string; key: string; fileType: string; exp: number; token: string };

export function thumbFile(blob: Blob): File {
  const webp = blob.type === "image/webp";
  return new File([blob], webp ? "thumb.webp" : "thumb.jpg", {
    type: webp ? "image/webp" : blob.type || "image/jpeg",
  });
}

export async function putViaPresign(blob: Blob, contentType: string): Promise<DirectGrant | null> {
  let presign: PresignResponse;
  try {
    const res = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType, size: blob.size }),
    });
    const body = (await res.json()) as PresignResponse;
    if (!res.ok || !body.direct) return null;
    presign = body;
  } catch {
    return null;
  }
  try {
    const put = await fetch(presign.url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!put.ok) return null;
  } catch {
    return null;
  }
  return { key: presign.key, fileType: presign.fileType, exp: presign.exp, token: presign.token };
}
