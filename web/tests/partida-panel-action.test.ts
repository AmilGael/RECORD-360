import { beforeEach, describe, expect, it, vi } from "vitest";

const { progressMock, concludeMock, reopenMock, renameMock, moveMock, tagsMock } = vi.hoisted(() => ({
  progressMock: vi.fn(),
  concludeMock: vi.fn(),
  reopenMock: vi.fn(),
  renameMock: vi.fn(),
  moveMock: vi.fn(),
  tagsMock: vi.fn(),
}));
vi.mock("@/app/actions/partida-progress", () => ({ updatePartidaProgress: progressMock }));
vi.mock("@/app/actions/lifecycle", () => ({ concludePartida: concludeMock, reopenPartida: reopenMock }));
vi.mock("@/app/actions/project-edit", () => ({ renamePartida: renameMock, movePartida: moveMock }));
vi.mock("@/app/actions/partida-tags", () => ({ setPartidaTags: tagsMock }));

import { runPanelAction } from "@/app/actions/partida-panel";

const fd = () => {
  const f = new FormData();
  f.set("partidaId", "p1");
  return f;
};

describe("runPanelAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes each panel action to its server action with the same form data", async () => {
    const cases = [
      ["progress", progressMock], ["conclude", concludeMock], ["reopen", reopenMock],
      ["rename", renameMock], ["move", moveMock], ["tags", tagsMock],
    ] as const;
    for (const [action, mock] of cases) {
      const data = fd();
      await expect(runPanelAction(action, data)).resolves.toEqual({ ok: true });
      expect(mock).toHaveBeenCalledWith(data);
    }
  });

  it("returns the action's own message instead of throwing (prod masks thrown messages)", async () => {
    reopenMock.mockRejectedValueOnce(new Error("El bloque está cerrado: reábrelo antes de reabrir la partida."));
    await expect(runPanelAction("reopen", fd())).resolves.toEqual({
      ok: false,
      error: "El bloque está cerrado: reábrelo antes de reabrir la partida.",
    });
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    renameMock.mockRejectedValueOnce("boom");
    await expect(runPanelAction("rename", fd())).resolves.toEqual({ ok: false, error: "No se pudo guardar." });
  });

  it("refuses an action name it does not know", async () => {
    await expect(runPanelAction("delete" as never, fd())).resolves.toEqual({ ok: false, error: "Acción inválida." });
    await expect(runPanelAction("constructor" as never, fd())).resolves.toEqual({ ok: false, error: "Acción inválida." });
  });
});
