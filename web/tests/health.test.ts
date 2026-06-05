import { describe, it, expect } from "vitest";
import { healthLevel } from "@/lib/project/health";

describe("healthLevel", () => {
  it("red below 34", () => { expect(healthLevel(0)).toBe("red"); expect(healthLevel(33)).toBe("red"); });
  it("yellow 34..66", () => { expect(healthLevel(34)).toBe("yellow"); expect(healthLevel(66)).toBe("yellow"); });
  it("green 67..100", () => { expect(healthLevel(67)).toBe("green"); expect(healthLevel(100)).toBe("green"); });
});
