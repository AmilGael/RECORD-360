import { describe, expect, it } from "vitest";
import { buildInformeIdempotencyKey } from "@/lib/informes/idempotency";

const base = {
  requesterId: "user-1",
  projectId: "proj-1",
  scopeType: "project",
  scopeId: "proj-1",
  archetype: "OWNER" as const,
  brief: "Informe mensual",
  from: new Date("2026-06-01T00:00:00Z"),
  to: new Date("2026-06-30T23:59:59Z"),
};

describe("buildInformeIdempotencyKey", () => {
  it("is stable for an identical request — the double-submit case", () => {
    expect(buildInformeIdempotencyKey(base)).toBe(buildInformeIdempotencyKey({ ...base }));
  });

  it("returns a sha256 hex digest", () => {
    expect(buildInformeIdempotencyKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["requesterId", { requesterId: "user-2" }],
    ["projectId", { projectId: "proj-2" }],
    ["scopeType", { scopeType: "segment" }],
    ["scopeId", { scopeId: "seg-9" }],
    ["archetype", { archetype: "SENIOR_MANAGEMENT" as const }],
    ["brief", { brief: "Otro enfoque" }],
    ["from", { from: new Date("2026-05-01T00:00:00Z") }],
    ["to", { to: new Date("2026-07-31T00:00:00Z") }],
  ])("changes when %s changes — a genuinely different request is not deduped", (_label, patch) => {
    expect(buildInformeIdempotencyKey({ ...base, ...patch })).not.toBe(buildInformeIdempotencyKey(base));
  });

  it("distinguishes a null period from an epoch-ish date", () => {
    const nulls = buildInformeIdempotencyKey({ ...base, from: null, to: null });
    expect(nulls).not.toBe(buildInformeIdempotencyKey(base));
    expect(nulls).toBe(buildInformeIdempotencyKey({ ...base, from: null, to: null }));
  });

  it("two users asking for the same report get different keys (each PDF carries its own firma)", () => {
    expect(buildInformeIdempotencyKey({ ...base, requesterId: "user-a" }))
      .not.toBe(buildInformeIdempotencyKey({ ...base, requesterId: "user-b" }));
  });

  it("cannot be collided by shifting content across field boundaries", () => {
    // With a naive separator (e.g. a space), moving text between adjacent
    // fields could produce the same joined string. The NUL separator prevents
    // it: these two must hash differently.
    const a = buildInformeIdempotencyKey({ ...base, scopeId: "x", brief: "y z" });
    const b = buildInformeIdempotencyKey({ ...base, scopeId: "x y", brief: "z" });
    expect(a).not.toBe(b);
  });
});
