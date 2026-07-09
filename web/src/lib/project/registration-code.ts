import { randomInt } from "node:crypto";

// Crockford base32 alphabet — no I, L, O, U (ambiguous when read aloud or
// transcribed from a printed report). The code certifies that a record belongs
// to an obra, so it must survive being dictated over the phone.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Immutable per-obra registration code, e.g. RPH-7K2M-94XW. */
export function generateRegistrationCode(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `RPH-${block()}-${block()}`;
}

export function isValidRegistrationCode(code: string): boolean {
  return /^RPH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code);
}
