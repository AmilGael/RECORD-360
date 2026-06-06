import { describe, it, expect } from "vitest";
import { retryOnConflict } from "@/lib/registro/retry";

const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

describe("retryOnConflict", () => {
  it("returns the result on first success without retrying", async () => {
    let calls = 0;
    const result = await retryOnConflict(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on a P2002 unique-constraint conflict, then succeeds", async () => {
    let calls = 0;
    const result = await retryOnConflict(async () => {
      calls++;
      if (calls < 3) throw p2002();
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rethrows a non-P2002 error immediately without retrying", async () => {
    let calls = 0;
    await expect(
      retryOnConflict(async () => {
        calls++;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("gives up and rethrows after exhausting attempts on persistent conflict", async () => {
    let calls = 0;
    await expect(
      retryOnConflict(async () => {
        calls++;
        throw p2002();
      }, 4),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(calls).toBe(4);
  });
});
