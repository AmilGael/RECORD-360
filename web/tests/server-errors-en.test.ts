import { afterAll, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "r360_lang" ? { value: "en" } : undefined) }),
}));

import { dictionaries } from "@/i18n/dictionaries";
import { logRegistro } from "@/app/actions/registro";
import { createDocument } from "@/app/actions/documents";
import { createInforme } from "@/app/actions/informes";
import { createChangeRequest } from "@/app/actions/cambios";
import { signPartidaAction } from "@/app/actions/signatures";
import { updateUserProfileForm } from "@/app/actions/profile";
import { closeSegmentForm } from "@/app/actions/lifecycle";

const unauthorized = dictionaries.en.serverErrors.unauthorized;

describe("English session", () => {
  afterAll(() => {
    authMock.mockReset();
  });

  it("logRegistro returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await logRegistro(null, new FormData());
    expect(res).toEqual({ ok: false, error: unauthorized });
  });

  it("createDocument returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await createDocument(null, new FormData());
    expect(res).toEqual({ ok: false, error: unauthorized });
  });

  it("createChangeRequest returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await createChangeRequest({ status: "idle" }, new FormData());
    expect(res).toMatchObject({ status: "error", message: unauthorized });
  });

  it("signPartidaAction returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await signPartidaAction(null, new FormData());
    expect(res).toEqual({ ok: false, error: unauthorized });
  });

  it("updateUserProfileForm returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await updateUserProfileForm(null, new FormData());
    expect(res).toEqual({ error: unauthorized });
  });

  it("closeSegmentForm returns English", async () => {
    authMock.mockResolvedValue(null);
    const res = await closeSegmentForm(null, new FormData());
    expect(res).toEqual({ error: unauthorized });
  });

  it("createInforme returns the English missing-configuration sentence", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await createInforme(null, new FormData());
      expect(res).toEqual({ ok: false, error: dictionaries.en.serverErrors.informeNotConfigured });
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
