import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyUploadGrant } from "@/lib/uploads/grant";

const authMock = vi.hoisted(() => vi.fn());
const presignPut = vi.hoisted(() => vi.fn());
const storageMock = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), presignPut }) as Record<string, unknown>);
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn().mockImplementation(async () => userRow) } } }));
vi.mock("@/lib/storage", () => ({ storage: storageMock }));

let userRow: Record<string, unknown> | null = null;

import { POST } from "@/app/api/uploads/presign/route";

function req(body: unknown) {
  return new Request("http://test.local/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  presignPut.mockReset();
  storageMock.presignPut = presignPut;
  userRow = { id: "u1", companyId: "c1", role: "ADMIN", disabledAt: null, name: "U", email: "u@x.do" };
  authMock.mockResolvedValue({ user: { id: "u1", companyId: "c1", role: "ADMIN" } });
  presignPut.mockResolvedValue({ url: "https://r2.example/put?sig=x", key: "11111111-2222-3333-4444-555555555555.pdf" });
});

describe("POST /api/uploads/presign", () => {
  it("401s without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ contentType: "application/pdf", size: 1000 }));
    expect(res.status).toBe(401);
  });
  it("rejects a disallowed content type", async () => {
    const res = await POST(req({ contentType: "image/svg+xml", size: 1000 }));
    expect(res.status).toBe(415);
  });
  it("rejects an oversize file with a message", async () => {
    const res = await POST(req({ contentType: "application/pdf", size: 31 * 1024 * 1024 }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });
  it("rejects a bogus size", async () => {
    const res = await POST(req({ contentType: "application/pdf", size: -5 }));
    expect(res.status).toBe(400);
  });
  it("returns direct:false when the storage driver cannot presign", async () => {
    storageMock.presignPut = undefined;
    const res = await POST(req({ contentType: "application/pdf", size: 1000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ direct: false });
  });
  it("returns a presigned url plus a grant the finalize action will accept", async () => {
    const res = await POST(req({ contentType: "application/pdf", size: 1000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.direct).toBe(true);
    expect(body.url).toBe("https://r2.example/put?sig=x");
    expect(body.key).toBe("11111111-2222-3333-4444-555555555555.pdf");
    expect(body.fileType).toBe("PDF");
    expect(verifyUploadGrant("u1", body)).toBe(true);
    expect(verifyUploadGrant("someone-else", body)).toBe(false);
    expect(presignPut).toHaveBeenCalledWith({ contentType: "application/pdf", size: 1000 });
  });
});
