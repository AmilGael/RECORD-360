import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { isCreditExhaustedError } from "@/lib/informes/client";

const apiError = (status: number, message: string) =>
  new Anthropic.APIError(status, { type: "error", error: { message } }, message, undefined);

// The live payload, verbatim, from a real exhausted-credit account.
const LIVE_CREDIT_MESSAGE =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';

describe("isCreditExhaustedError", () => {
  it("matches the real exhausted-credit payload", () => {
    expect(isCreditExhaustedError(apiError(400, LIVE_CREDIT_MESSAGE))).toBe(true);
  });

  it("matches on the Plans & Billing phrasing alone", () => {
    expect(isCreditExhaustedError(apiError(400, "Please go to Plans & Billing to upgrade."))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCreditExhaustedError(apiError(400, "YOUR CREDIT BALANCE IS TOO LOW"))).toBe(true);
  });

  it("does NOT swallow other 400s — they keep the generic error", () => {
    expect(isCreditExhaustedError(apiError(400, "max_tokens: must be greater than 0"))).toBe(false);
  });

  it("does not match a 401 (that is the auth branch)", () => {
    expect(isCreditExhaustedError(apiError(401, "credit balance is too low"))).toBe(false);
  });

  it("does not match a 529 (that is the busy/retry branch)", () => {
    expect(isCreditExhaustedError(apiError(529, "overloaded"))).toBe(false);
  });

  it("ignores non-Anthropic errors", () => {
    expect(isCreditExhaustedError(new Error("credit balance is too low"))).toBe(false);
    expect(isCreditExhaustedError(null)).toBe(false);
    expect(isCreditExhaustedError(undefined)).toBe(false);
  });
});
