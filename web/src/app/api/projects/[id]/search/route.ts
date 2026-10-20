import { requireFreshSession } from "@/lib/auth/session";
import { searchProject } from "@/lib/project/search";

/** Instant obra search. Null from searchProject is a hidden obra: 404, not 403. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requireFreshSession();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchProject(
    { id: user.id, companyId: user.companyId, role: user.role },
    id,
    q,
  );
  if (!results) return new Response(null, { status: 404 });
  return Response.json(results, { headers: { "Cache-Control": "private, no-store" } });
}
