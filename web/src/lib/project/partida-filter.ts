export const UNGROUPED_FILTER = "__ungrouped";

export type PartidaFilterInput = {
  query?: string | null;
  segmentId?: string | null;
};

export type SegmentGroup<TPartida> = {
  id: string;
  name: string;
  partidas: TPartida[];
};

type PartidaLike = {
  name: string;
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
  const matchesQuery = (p: TPartida) => !query || p.name.toLowerCase().includes(query);
  const filterPartidas = (rows: TPartida[]) => rows.filter(matchesQuery);

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
  const hasFilters = Boolean(query || segmentId);

  return { segments: filteredSegments, ungrouped: filteredUngrouped, total, hasFilters };
}
