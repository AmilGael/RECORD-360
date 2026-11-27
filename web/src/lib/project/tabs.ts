// Project tab model. Each tab is a real route under /app/projects/<id>; the
// old `?tab=` links redirect via `legacyTabTarget`. Pure TypeScript so the
// tab strip (client) and the route pages (server) share one source of truth.
//
// Query-string rules match `projectHrefWithParams` in space-links.ts: arrays
// repeat the key, empty / null / undefined values are dropped.

export const PROJECT_TABS = [
  { id: "partidas", segment: "", labelKey: "tabPartidas" },
  { id: "planos", segment: "planos", labelKey: "tabPlanos" },
  { id: "solicitudes", segment: "solicitudes", labelKey: "tabSolicitudes" },
  { id: "analitica", segment: "analitica", labelKey: "tabAnalytics" },
  { id: "informes", segment: "informes", labelKey: "tabInformes" },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];

type ParamValue = string | string[] | null | undefined;

function segmentOf(tab: ProjectTabId): string {
  return PROJECT_TABS.find((t) => t.id === tab)!.segment;
}

function queryString(params: Record<string, ParamValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v) search.append(key, v);
    } else {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function projectTabHref(
  projectId: string,
  tab: ProjectTabId,
  params: Record<string, ParamValue> = {},
): string {
  const segment = segmentOf(tab);
  const base = `/app/projects/${projectId}${segment ? `/${segment}` : ""}`;
  return `${base}${queryString(params)}`;
}

// Legacy `?tab=` value -> tab. Any value not listed (including different
// casing) maps to the index tab.
const LEGACY_TAB: Record<string, ProjectTabId> = {
  code: "partidas",
  planos: "planos",
  cambios: "solicitudes",
  analitica: "analitica",
  informes: "informes",
};

/**
 * Where an old `?tab=` link should land, or null when the URL has no `tab`
 * key (no redirect, so no loop). The returned target never carries `tab`, so
 * following it can never redirect again. A repeated `tab` uses its first
 * value; every other param is kept in order.
 */
export function legacyTabTarget(
  projectId: string,
  search: Record<string, string | string[] | undefined>,
): string | null {
  if (!("tab" in search)) return null;
  const raw = search.tab;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined) return null;
  const tab = Object.prototype.hasOwnProperty.call(LEGACY_TAB, first)
    ? LEGACY_TAB[first]
    : "partidas";
  const rest = { ...search };
  delete rest.tab;
  return projectTabHref(projectId, tab, rest);
}

/** Active tab for a pathname; unknown subpaths fall back to the index tab. */
export function activeProjectTab(pathname: string, projectId: string): ProjectTabId {
  const base = `/app/projects/${projectId}`;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path !== base && !path.startsWith(`${base}/`)) return "partidas";
  const first = path.slice(base.length + 1).split("/")[0];
  if (first === "cambios") return "solicitudes";
  const match = PROJECT_TABS.find((t) => t.segment !== "" && t.segment === first);
  return match ? match.id : "partidas";
}
