import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { PartidaPanelView, type PanelCopy } from "@/components/partida-panel";
import { activityAging } from "@/lib/partida/aging";
import type { PartidaPreview } from "@/lib/partida/preview";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

function panelT(): PanelCopy {
  const P = dictionaries.es.project;
  const L = dictionaries.es.lifecycle;
  return {
    empty: P.summaryEmpty,
    noEntries: P.summaryNoEntries,
    newRegistro: P.newRegistro,
    openCuaderno: P.openCuaderno,
    editPartida: P.editPartida,
    panelOffline: P.panelOffline,
    panelClose: P.panelClose,
    progress: dictionaries.es.partida.progress,
    save: P.save,
    conclude: L.concludePartida,
    reopen: L.reopenPartida,
    concluded: L.concluded,
    concludedOn: L.concludedOn,
    rename: P.rename,
    move: P.move,
    moveTo: P.moveTo,
    ungrouped: P.ungrouped,
    tagsLabel: P.tagsLabel,
  };
}

const shell = {
  id: "p1",
  name: "Losa N3",
  progressPct: 40,
  completedAt: null as string | null,
  tags: [] as string[],
  segmentName: "Cocina",
  segmentClosedAt: null as string | null,
};

const preview: PartidaPreview = {
  id: "p1",
  name: "Losa N3",
  projectId: "obra1",
  segment: { id: "s1", name: "Cocina", closedAt: null },
  progressPct: 40,
  completedAt: null,
  registroCount: 0,
  openRequestCount: 0,
  canEdit: false,
  tags: [],
  registros: [],
};

const noop = () => {};

function render(canEdit: boolean, extra?: { completedAt?: string | null; segmentClosedAt?: string | null }): string {
  const completedAt = extra?.completedAt ?? null;
  return renderToStaticMarkup(createElement(PartidaPanelView, {
    shell: { ...shell, completedAt, segmentClosedAt: extra?.segmentClosedAt ?? null },
    preview: { ...preview, completedAt, canEdit },
    canEdit,
    lang: "es",
    t: panelT(),
    open: true,
    headingRef: noop,
    formError: null,
    busy: false,
    offline: false,
    segments: [{ id: "s1", name: "Cocina" }],
    onClose: noop,
    onProgress: noop,
    onConclude: noop,
    onReopen: noop,
    onRename: noop,
    onMove: noop,
    onTags: noop,
  }) as ReactNode);
}

describe("activityAging", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  it("marks 7 and 14 days and leaves recent activity alone", () => {
    expect(activityAging(new Date(now - 3 * 24 * 3600_000).toISOString(), now)).toBeNull();
    expect(activityAging(new Date(now - 7 * 24 * 3600_000).toISOString(), now)).toBe("7");
    expect(activityAging(new Date(now - 14 * 24 * 3600_000).toISOString(), now)).toBe("14");
    expect(activityAging(null, now)).toBeNull();
  });
});

describe("PartidaPanelView edit chrome", () => {
  it("hides Editar partida, progress, Concluir and Reabrir when canEdit is false", () => {
    const html = render(false);
    expect(html).toContain("Losa N3");
    expect(html).toContain("Nuevo registro");
    expect(html).not.toContain("Editar partida");
    expect(html).not.toContain('id="panel-progress-p1"');
    expect(html).not.toContain("Concluir partida");
    expect(html).not.toContain("Reabrir partida");
  });

  it("shows progress and Concluir when canEdit and the partida is open", () => {
    const html = render(true);
    expect(html).toContain("Editar partida");
    expect(html).toContain('id="panel-progress-p1"');
    expect(html).toContain("Concluir partida");
    expect(html).not.toContain("Reabrir partida");
  });

  it("shows no progress input for a concluded partida, and Reabrir when the bloque is open", () => {
    const html = render(true, { completedAt: "2026-10-01T12:00:00.000Z" });
    expect(html).toContain("Concluida · 100%");
    expect(html).not.toContain('id="panel-progress-p1"');
    expect(html).toContain("Reabrir partida");
  });
});
