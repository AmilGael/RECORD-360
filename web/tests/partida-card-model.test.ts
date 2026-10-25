import { describe, expect, it } from "vitest";
import { partidaCardModel } from "@/lib/partida/card-model";
import { formatTimestamp } from "@/lib/format/datetime";

const DAY = 24 * 60 * 60_000;
const now = new Date("2027-03-20T15:00:00Z");
const row = { id: "p1", name: "Vaciado losa N3", progressPct: 40 };
const ctx = { lang: "es" as const, now, blockName: "Cocina", recordCount: 3, lastActivityAt: new Date(now.getTime() - DAY) };

describe("partidaCardModel", () => {
  it("carries id, name, bloque, progress and record count through", () => {
    expect(partidaCardModel(row, ctx)).toMatchObject({
      id: "p1", name: "Vaciado losa N3", blockName: "Cocina", progressPct: 40, recordCount: 3, tags: [],
    });
    expect(partidaCardModel({ ...row, tags: [{ tag: { name: "urgente" } }] }, ctx).tags).toEqual(["urgente"]);
  });

  it("is concluded when completedAt is set, whatever the progress", () => {
    expect(partidaCardModel({ ...row, completedAt: "2027-03-01T00:00:00Z", progressPct: 70 }, ctx).status).toBe("concluded");
  });

  it("is not started at 0% with no records", () => {
    expect(partidaCardModel({ ...row, progressPct: 0 }, { ...ctx, recordCount: 0, lastActivityAt: null }).status).toBe("notStarted");
  });

  it("is in progress at 0% once it has a record, and above 0% with none", () => {
    expect(partidaCardModel({ ...row, progressPct: 0 }, ctx).status).toBe("inProgress");
    expect(partidaCardModel(row, { ...ctx, recordCount: 0 }).status).toBe("inProgress");
  });

  it("has no last-updated text without activity, and a formatted time with it", () => {
    expect(partidaCardModel(row, { ...ctx, lastActivityAt: null }).lastUpdated).toBeNull();
    // Relative wording ("hace 1 día") is measured from ctx.now, not the wall clock.
    expect(partidaCardModel(row, ctx).lastUpdated).toBe(formatTimestamp(ctx.lastActivityAt, "es", now));
  });

  it("ages like activityAging: none, 7 days, 14 days, no activity", () => {
    const at = (days: number) => ({ ...ctx, lastActivityAt: new Date(now.getTime() - days * DAY) });
    expect(partidaCardModel(row, at(2)).aging).toBe("none");
    expect(partidaCardModel(row, at(8)).aging).toBe("aging7");
    expect(partidaCardModel(row, at(15)).aging).toBe("aging14");
    expect(partidaCardModel(row, { ...ctx, lastActivityAt: null }).aging).toBe("noActivity");
  });

  it("keeps the progress inside 0..100", () => {
    expect(partidaCardModel({ ...row, progressPct: 140 }, ctx).progressPct).toBe(100);
    expect(partidaCardModel({ ...row, progressPct: -5 }, ctx).progressPct).toBe(0);
  });
});
