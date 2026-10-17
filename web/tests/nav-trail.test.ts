import { describe, expect, it } from "vitest";
import {
  TRAIL_CAP, isTrailPath, nextTrail, normalizeEntry, parseTrail, popTo, previousEntry,
  pushEntry, reconcileOnPop, type Trail, type TrailChange,
} from "@/lib/nav/trail";

const OBRA = "/app/projects/obra1";
const COCINA = `${OBRA}?tab=code&block=seg-cocina`;
const COCINA_P = `${COCINA}&p=par1`;
const PARTIDA = "/app/partidas/par1";

/** Replays route changes the way NavTrail sees them, starting from an empty trail. */
function replay(steps: Array<[string, TrailChange?]>): Trail {
  return steps.reduce<Trail>((trail, [url, change]) => nextTrail(trail, url, change ?? { kind: "push" }), []);
}

/** What BackButton does on click: pop to the previous entry and navigate there with the marker. */
function volver(trail: Trail): { trail: Trail; target: string | null } {
  const target = previousEntry(trail);
  if (!target) return { trail, target: null };
  const popped = popTo(trail, target);
  return { trail: nextTrail(popped, target, { kind: "back", target }), target };
}

describe("normalizeEntry", () => {
  it("drops correctionOf and replyTo and keeps every other param in order", () => {
    expect(normalizeEntry(`${PARTIDA}?correctionOf=r1`)).toBe(PARTIDA);
    expect(normalizeEntry(`${PARTIDA}?replyTo=r2&page=3`)).toBe(`${PARTIDA}?page=3`);
    expect(normalizeEntry(`${OBRA}?tab=code&block=b&p=x&space=media&tags=a&tags=b&pmin=10&page=2`))
      .toBe(`${OBRA}?tab=code&block=b&p=x&space=media&tags=a&tags=b&pmin=10&page=2`);
  });
  it("accepts absolute URLs and drops the hash", () => {
    expect(normalizeEntry(`https://www.raphel360.com${COCINA}#top`)).toBe(COCINA);
  });
});

describe("isTrailPath", () => {
  it("accepts /app and its children only", () => {
    expect(isTrailPath("/app")).toBe(true);
    expect(isTrailPath("/app/pending")).toBe(true);
    expect(isTrailPath("/application")).toBe(false);
    expect(isTrailPath("/login")).toBe(false);
  });
});

describe("pushEntry", () => {
  it("skips repeats of the top and non-/app URLs", () => {
    let t = pushEntry([], "/app");
    t = pushEntry(t, "/app");
    t = pushEntry(t, "/login");
    t = pushEntry(t, "/verify/ABC");
    expect(t).toEqual(["/app"]);
  });
  it("treats a correction URL as the same screen as the partida", () => {
    expect(pushEntry([PARTIDA], `${PARTIDA}?correctionOf=r1`)).toEqual([PARTIDA]);
  });
  it(`keeps only the last ${TRAIL_CAP} entries`, () => {
    let t: Trail = [];
    for (let i = 0; i < TRAIL_CAP + 5; i++) t = pushEntry(t, `/app/partidas/p${i}`);
    expect(t).toHaveLength(TRAIL_CAP);
    expect(t[0]).toBe("/app/partidas/p5");
    expect(t[TRAIL_CAP - 1]).toBe(`/app/partidas/p${TRAIL_CAP + 4}`);
  });
});

describe("popTo", () => {
  it("cuts back to the last occurrence and leaves unknown entries alone", () => {
    expect(popTo(["/app", OBRA, "/app", PARTIDA], "/app")).toEqual(["/app", OBRA, "/app"]);
    expect(popTo(["/app", OBRA], "/app/pending")).toEqual(["/app", OBRA]);
  });
});

describe("reconcileOnPop", () => {
  it("pops when the browser went back one entry", () => {
    expect(reconcileOnPop(["/app", OBRA, PARTIDA], OBRA)).toEqual(["/app", OBRA]);
  });
  it("keeps the trail when only transient params changed", () => {
    expect(reconcileOnPop(["/app", PARTIDA], `${PARTIDA}?correctionOf=r1`)).toEqual(["/app", PARTIDA]);
  });
  it("starts over from the current screen otherwise (forward, or a jump)", () => {
    expect(reconcileOnPop(["/app", OBRA], PARTIDA)).toEqual([PARTIDA]);
    expect(reconcileOnPop([], PARTIDA)).toEqual([PARTIDA]);
  });
});

describe("nextTrail", () => {
  it("back marker matching the landing screen leaves the already-popped trail", () => {
    expect(nextTrail(["/app", OBRA], OBRA, { kind: "back", target: OBRA })).toEqual(["/app", OBRA]);
  });
  it("back marker whose target redirected elsewhere records the real screen", () => {
    expect(nextTrail(["/app", OBRA], "/app", { kind: "back", target: OBRA })).toEqual(["/app", OBRA, "/app"]);
  });
});

describe("parseTrail", () => {
  it("reads valid trails and rejects anything else", () => {
    expect(parseTrail(JSON.stringify(["/app", OBRA]))).toEqual(["/app", OBRA]);
    expect(parseTrail(null)).toEqual([]);
    expect(parseTrail("not json")).toEqual([]);
    expect(parseTrail(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseTrail(JSON.stringify(["/app", 3]))).toEqual([]);
  });
});

describe("navigation sequences (quest verification list)", () => {
  it("obra → bloque Cocina → partida → Volver lands on Cocina with the partida selected", () => {
    const t = replay([["/app"], [OBRA], [COCINA], [COCINA_P], [PARTIDA]]);
    const back = volver(t);
    expect(back.target).toBe(COCINA_P);
    expect(back.trail).toEqual(["/app", OBRA, COCINA, COCINA_P]);
  });

  it("partida opened by direct URL has no previous entry, so the server fallback is used", () => {
    const t = replay([[PARTIDA]]);
    expect(volver(t).target).toBeNull();
  });

  it("obra Planos tab → Analítica tab → Volver lands on Planos", () => {
    const t = replay([[OBRA], [`${OBRA}?tab=planos`], [`${OBRA}?tab=analitica`]]);
    expect(volver(t).target).toBe(`${OBRA}?tab=planos`);
  });

  it("browser back once, then Volver goes one further back with no ping-pong", () => {
    const t = replay([["/app"], [OBRA], [COCINA_P], [PARTIDA], [COCINA_P, { kind: "pop" }]]);
    expect(t).toEqual(["/app", OBRA, COCINA_P]);
    const first = volver(t);
    expect(first.target).toBe(OBRA);
    const second = volver(first.trail);
    expect(second.target).toBe("/app");
    expect(volver(second.trail).target).toBeNull();
  });

  it("correction flow then Volver returns to the screen before the partida", () => {
    const t = replay([
      [COCINA_P], [PARTIDA], [`${PARTIDA}?correctionOf=r1`],
      // LogComposer router.replace()s back to the plain partida after saving.
      [PARTIDA],
    ]);
    expect(t).toEqual([COCINA_P, PARTIDA]);
    expect(volver(t).target).toBe(COCINA_P);
  });

  it("browser back out of a correction keeps the trail", () => {
    const t = replay([[COCINA_P], [PARTIDA], [`${PARTIDA}?correctionOf=r1`], [PARTIDA, { kind: "pop" }]]);
    expect(volver(t).target).toBe(COCINA_P);
  });

  it("notifications → partida from a notification → Volver returns to notifications", () => {
    const t = replay([["/app"], ["/app/notifications?status=unread"], [PARTIDA]]);
    expect(volver(t).target).toBe("/app/notifications?status=unread");
  });

  it("browser forward after a back resets to the current screen", () => {
    const t = replay([["/app"], [OBRA], [PARTIDA], [OBRA, { kind: "pop" }], [PARTIDA, { kind: "pop" }]]);
    expect(t).toEqual([PARTIDA]);
  });
});
