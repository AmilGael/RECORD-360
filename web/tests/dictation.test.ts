import { describe, expect, it } from "vitest";
import { classifyDictationError, mergeTranscript } from "@/lib/dictation";

describe("classifyDictationError", () => {
  it("maps not-allowed / service-not-allowed to 'permission'", () => {
    expect(classifyDictationError("not-allowed")).toBe("permission");
    expect(classifyDictationError("service-not-allowed")).toBe("permission");
  });
  it("maps no-speech to 'no-speech'", () => {
    expect(classifyDictationError("no-speech")).toBe("no-speech");
  });
  it("maps network to 'network'", () => {
    expect(classifyDictationError("network")).toBe("network");
  });
  it("maps aborted to 'aborted'", () => {
    expect(classifyDictationError("aborted")).toBe("aborted");
  });
  it("falls back to 'other' for unrecognized codes", () => {
    expect(classifyDictationError("audio-capture")).toBe("other");
    expect(classifyDictationError("language-not-supported")).toBe("other");
    expect(classifyDictationError("")).toBe("other");
  });
});

describe("mergeTranscript", () => {
  it("uses the transcript alone when there is no existing text", () => {
    expect(mergeTranscript("", "hola mundo")).toBe("hola mundo");
  });
  it("appends to existing typed text rather than replacing it", () => {
    expect(mergeTranscript("nota inicial", "continuación dictada")).toBe("nota inicial continuación dictada");
  });
  it("is a no-op for an empty/whitespace-only transcript, preserving existing text exactly", () => {
    expect(mergeTranscript("texto existente", "")).toBe("texto existente");
    expect(mergeTranscript("texto existente", "   ")).toBe("texto existente");
  });
  it("treats whitespace-only existing text as empty (uses transcript alone)", () => {
    expect(mergeTranscript("   ", "dictado")).toBe("dictado");
  });
  it("trims the transcript before appending", () => {
    expect(mergeTranscript("uno", "  dos  ")).toBe("uno dos");
  });
});
