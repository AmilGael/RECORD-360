"use server";
import { concludePartida, reopenPartida } from "@/app/actions/lifecycle";
import { updatePartidaProgress } from "@/app/actions/partida-progress";
import { movePartida, renamePartida } from "@/app/actions/project-edit";
import { setPartidaTags } from "@/app/actions/partida-tags";

export type PanelAction = "progress" | "conclude" | "reopen" | "rename" | "move" | "tags";
export type PanelActionResult = { ok: true } | { ok: false; error: string };

const ACTIONS: Record<PanelAction, (formData: FormData) => Promise<unknown>> = {
  progress: updatePartidaProgress,
  conclude: concludePartida,
  reopen: reopenPartida,
  rename: renamePartida,
  move: movePartida,
  tags: setPartidaTags,
};

// The partida panel calls these actions from code, not from a form. Next.js
// masks a thrown server-action error in production (only an opaque digest
// reaches the client), so the actions' own messages ("El bloque está
// cerrado…") would never show. Catching here and returning the message keeps
// it visible in dev AND prod — the same convention as createChangeRequest in
// app/actions/cambios.ts. The wrapped actions keep their throwing contract.
export async function runPanelAction(action: PanelAction, formData: FormData): Promise<PanelActionResult> {
  // A server action is a public endpoint: `action` is whatever the caller
  // sent, so only own keys count (never "constructor" or "toString").
  if (!Object.hasOwn(ACTIONS, action)) return { ok: false, error: "Acción inválida." };
  const fn = ACTIONS[action];
  try {
    await fn(formData);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : "No se pudo guardar." };
  }
}
