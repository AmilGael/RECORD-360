import { storage } from "@/lib/storage";
import { Readable } from "node:stream";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    const nodeStream = await storage.get(key);
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;
    return new Response(webStream);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
