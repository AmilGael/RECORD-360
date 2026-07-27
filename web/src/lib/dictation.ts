/**
 * Pure helpers for the Web Speech dictation control in log-composer.tsx.
 * Kept DOM/browser-API-free so the event-handling logic (error
 * classification, transcript merging) is unit-testable without mocking the
 * real SpeechRecognition API (R3 WS9).
 */

export type DictationErrorKind = "permission" | "no-speech" | "network" | "aborted" | "other";

/**
 * Map a SpeechRecognitionErrorEvent.error code to a UI-facing error kind so
 * the composer can show a distinct, actionable message per case instead of
 * one generic "dictation failed". Unrecognized codes (e.g. "audio-capture",
 * "language-not-supported") fall back to "other" rather than throwing.
 */
export function classifyDictationError(code: string): DictationErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "other";
  }
}

/**
 * Append a finished dictation transcript to whatever text is already in the
 * composer. NEVER replaces existing (typed) text — the user may have typed
 * before or after dictating. An empty/whitespace-only transcript is a no-op.
 */
export function mergeTranscript(existingText: string, transcript: string): string {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return existingText;
  return existingText.trim() ? `${existingText} ${trimmedTranscript}` : trimmedTranscript;
}
