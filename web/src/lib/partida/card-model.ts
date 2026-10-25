import type { Lang } from "@/i18n/dictionaries";
import { formatTimestamp } from "@/lib/format/datetime";
import { activityAging } from "@/lib/partida/aging";

export type PartidaCardStatus = "concluded" | "inProgress" | "notStarted";
export type PartidaCardAging = "none" | "aging7" | "aging14" | "noActivity";

export type PartidaCard = {
  id: string;
  name: string;
  blockName: string | null;
  progressPct: number;
  status: PartidaCardStatus;
  recordCount: number;
  lastUpdated: string | null;
  aging: PartidaCardAging;
  tags: string[];
};

/**
 * What a partida card shows, worked out once so the grid stays presentational.
 * Status is a lifecycle fact (concluded) or follows the work done: nothing
 * recorded and 0% is "not started", anything else is "in progress".
 */
export function partidaCardModel(
  row: { id: string; name: string; progressPct: number; completedAt?: string | null; tags?: { tag: { name: string } }[] },
  ctx: { lang: Lang; now: Date; blockName: string | null; recordCount: number; lastActivityAt: Date | null },
): PartidaCard {
  const status: PartidaCardStatus = row.completedAt
    ? "concluded"
    : row.progressPct <= 0 && ctx.recordCount === 0
      ? "notStarted"
      : "inProgress";
  const mark = activityAging(ctx.lastActivityAt?.toISOString() ?? null, ctx.now.getTime());
  const aging: PartidaCardAging = !ctx.lastActivityAt
    ? "noActivity"
    : mark === "14" ? "aging14" : mark === "7" ? "aging7" : "none";
  return {
    id: row.id,
    name: row.name,
    blockName: ctx.blockName,
    progressPct: Math.min(Math.max(row.progressPct, 0), 100),
    status,
    recordCount: ctx.recordCount,
    lastUpdated: ctx.lastActivityAt ? formatTimestamp(ctx.lastActivityAt, ctx.lang, ctx.now) : null,
    aging,
    tags: (row.tags ?? []).map((x) => x.tag.name),
  };
}
