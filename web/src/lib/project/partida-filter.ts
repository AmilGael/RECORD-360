import { foldForSearch } from "@/lib/text/fold";

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

/** Name match used by the bloque list. Trimmed, case- and accent-insensitive substring. */
export function partidaNameMatches(name: string, query: string | null | undefined): boolean {
  const q = foldForSearch(String(query ?? "").trim());
  if (!q) return true;
  return foldForSearch(name).includes(q);
}

/**
 * Whether the filter box should take the server's `q` as its new value. The
 * box writes the URL 250ms after typing stops, and any refresh re-renders the
 * page with whatever the URL held when the request left. Only a real
 * navigation (a facet link, Limpiar, a submit) should replace what is typed:
 * - `propQ === lastWritten`: our own write coming back. Keep the typing.
 * - `propQ !== urlQ`: rendered before the latest write. Stale; keep it.
 */
export function shouldAdoptUrlQuery(propQ: string, lastWritten: string, urlQ: string): boolean {
  return propQ !== lastWritten && propQ === urlQ.trim();
}

/** Applies the name query to rows that already passed the facet filters. */
export function applyPartidaNameFilter<TSegment extends SegmentGroup<PartidaLike>, TUngrouped extends PartidaLike>(
  segments: TSegment[],
  ungrouped: TUngrouped[],
  query: string | null | undefined,
  hasFilters: boolean,
) {
  const q = normalize(query);
  const nextSegments = segments
    .map((s) => ({ ...s, partidas: s.partidas.filter((p) => partidaNameMatches(p.name, q)) }))
    .filter((s) => s.partidas.length > 0);
  const nextUngrouped = ungrouped.filter((p) => partidaNameMatches(p.name, q));
  const total = nextUngrouped.length + nextSegments.reduce((sum, s) => sum + s.partidas.length, 0);
  return {
    segments: nextSegments,
    ungrouped: nextUngrouped,
    total,
    hasFilters: hasFilters || Boolean(q),
  };
}

// TSegment and TUngrouped are independent so that each argument is its own inference
// site: tying both to one parameter let an empty `ungrouped` literal collapse it to
// `never` and poison the segment constraint.
export function filterPartidaGroups<TSegment extends SegmentGroup<PartidaLike>, TUngrouped extends PartidaLike>(
  segments: TSegment[],
  ungrouped: TUngrouped[],
  filters: PartidaFilterInput,
) {
  const segmentId = String(filters.segmentId ?? "");
  const tags = (filters.tags ?? []).filter(Boolean);
  const matches = (p: PartidaLike) => {
    if (tags.length && !tags.some((tg) => (p.tagNames ?? []).includes(tg))) return false;
    if (filters.progressMin != null && !(typeof p.progressPct === "number" && p.progressPct >= filters.progressMin)) return false;
    if (filters.progressMax != null && !(typeof p.progressPct === "number" && p.progressPct <= filters.progressMax)) return false;
    if (filters.openCambios && !p.hasOpenCambios) return false;
    if (filters.createdFrom && !(p.createdAt && p.createdAt >= filters.createdFrom)) return false;
    if (filters.createdTo && !(p.createdAt && p.createdAt <= filters.createdTo)) return false;
    return true;
  };
  const filterPartidas = <T extends PartidaLike>(rows: T[]) => rows.filter(matches);

  const includeUngrouped = !segmentId || segmentId === UNGROUPED_FILTER;
  const includeSegments = !segmentId || segmentId !== UNGROUPED_FILTER;

  const filteredSegments = includeSegments
    ? segments
        .filter((s) => !segmentId || s.id === segmentId)
        .map((s) => ({ ...s, partidas: filterPartidas(s.partidas) }))
        .filter((s) => s.partidas.length > 0)
    : [];
  const filteredUngrouped = includeUngrouped ? filterPartidas(ungrouped) : [];
  const hasFilters = Boolean(
    segmentId || tags.length || filters.progressMin != null || filters.progressMax != null ||
    filters.openCambios || filters.createdFrom || filters.createdTo,
  );

  return applyPartidaNameFilter(filteredSegments, filteredUngrouped, filters.query, hasFilters);
}
