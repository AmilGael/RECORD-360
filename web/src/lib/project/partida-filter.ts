export const UNGROUPED_FILTER = "__ungrouped";

export type PartidaFilterInput = {
  query?: string | null;
  segmentId?: string | null;
  tags?: string[] | null;
  progressMin?: number | null;
  progressMax?: number | null;
  openCambios?: boolean | null;
  createdFrom?: Date | null;
  createdTo?: Date | null;
};

export type SegmentGroup<TPartida> = {
  id: string;
  name: string;
  partidas: TPartida[];
};

type PartidaLike = {
  name: string;
  progressPct?: number;
  createdAt?: Date;
  tagNames?: string[];
  hasOpenCambios?: boolean;
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function filterPartidaGroups<TPartida extends PartidaLike, TSegment extends SegmentGroup<TPartida>>(
  segments: TSegment[],
  ungrouped: TPartida[],
  filters: PartidaFilterInput,
) {
  const query = normalize(filters.query);
  const segmentId = String(filters.segmentId ?? "");
  const tags = (filters.tags ?? []).filter(Boolean);
  const matches = (p: TPartida) => {
    if (query && !p.name.toLowerCase().includes(query)) return false;
    if (tags.length && !tags.some((tg) => (p.tagNames ?? []).includes(tg))) return false;
    if (filters.progressMin != null && !(typeof p.progressPct === "number" && p.progressPct >= filters.progressMin)) return false;
    if (filters.progressMax != null && !(typeof p.progressPct === "number" && p.progressPct <= filters.progressMax)) return false;
    if (filters.openCambios && !p.hasOpenCambios) return false;
    if (filters.createdFrom && !(p.createdAt && p.createdAt >= filters.createdFrom)) return false;
    if (filters.createdTo && !(p.createdAt && p.createdAt <= filters.createdTo)) return false;
    return true;
  };
  const filterPartidas = (rows: TPartida[]) => rows.filter(matches);

  const includeUngrouped = !segmentId || segmentId === UNGROUPED_FILTER;
  const includeSegments = !segmentId || segmentId !== UNGROUPED_FILTER;

  const filteredSegments = includeSegments
    ? segments
        .filter((s) => !segmentId || s.id === segmentId)
        .map((s) => ({ ...s, partidas: filterPartidas(s.partidas) }))
        .filter((s) => s.partidas.length > 0)
    : [];
  const filteredUngrouped = includeUngrouped ? filterPartidas(ungrouped) : [];
  const total = filteredUngrouped.length + filteredSegments.reduce((sum, s) => sum + s.partidas.length, 0);
  const hasFilters = Boolean(
    query || segmentId || tags.length || filters.progressMin != null || filters.progressMax != null ||
    filters.openCambios || filters.createdFrom || filters.createdTo,
  );

  return { segments: filteredSegments, ungrouped: filteredUngrouped, total, hasFilters };
}
