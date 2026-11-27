import { describe, expect, it } from "vitest";
import { coverModel } from "@/lib/project/cover";

describe("coverModel", () => {
  it("gives the placeholder for null, undefined and an empty key", () => {
    expect(coverModel(null)).toEqual({ kind: "placeholder" });
    expect(coverModel(undefined)).toEqual({ kind: "placeholder" });
    expect(coverModel("")).toEqual({ kind: "placeholder" });
  });

  it("serves a stored key from the media route", () => {
    expect(coverModel("abc/def.jpg")).toEqual({ kind: "image", src: "/api/media/abc/def.jpg" });
  });
});
