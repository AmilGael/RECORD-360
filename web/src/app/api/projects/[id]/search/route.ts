import { requireFreshSession } from "@/lib/auth/session";
import { searchProject } from "@/lib/project/search";

const EMPTY = { partidas: [], registros: [], documentos: [], cambios: [] };
const MAX_QUERY = 200;

/** Instant obra search. A hidden obra is 404, not 403. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFreshSession();
    const { id } = await ctx.params;
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
    // The box does not search under 2 characters. Skip the database entirely.
    if (q.length < 2) {
      return Response.json(EMPTY, { headers: { "Cache-Control": "private, no-store" } });
    }
    const results = await searchProject(
      { id: user.id, companyId: user.companyId, role: user.role },
      id,
      q,
    );
    if (!results) return new Response(null, { status: 404 });
    return Response.json(results, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Forbidden") return Response.json({ error: message }, { status: 403 });
    console.error("[project search]", e);
    return new Response(null, { status: 404 });
  }
}
