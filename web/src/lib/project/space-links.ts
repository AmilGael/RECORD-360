// Canonical block-workspace href builder (WS4F). Single source of truth for
// links that switch the active block/space inside a project's workspace.
//
// The bug this fixes: bloque-spaces-panel's own space/segment links built
// their href with a `spaceBlock` query param while the rest of the project
// page (block navigation, ProjectFileTree, partida-creation UI) reads the
// `block` param. Clicking a space link therefore cleared `block`, which made
// the page recompute `inBloqueView = false` and silently kicked the user out
// of the block workspace back to the bloques overview — losing the selected
// partida and every active filter in the process.
//
// `block` is the ONLY canonical param going forward. Every link generated
// here also carries forward the rest of the workspace state (selected
// partida, search/facet filters) so switching block or space never resets
// them.

export type PreservedParams = {
  p?: string | null;
  q?: string | null;
  tags?: string[] | null;
  pmin?: string | null;
  pmax?: string | null;
  cambios?: string | null;
  ffrom?: string | null;
  fto?: string | null;
};

export function projectHrefWithParams(
  projectId: string,
  params: Record<string, string | string[] | null | undefined>,
): string {
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
  return `/app/projects/${projectId}${qs ? `?${qs}` : ""}`;
}

/** Build a workspace link that switches to `block`/`space`, preserving everything else. */
export function spaceHref(
  projectId: string,
  preserved: PreservedParams,
  block: string,
  space: string,
): string {
  return projectHrefWithParams(projectId, { ...preserved, tab: "code", block, space });
}
