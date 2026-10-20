export const MIN_PASSWORD_LENGTH = 12;

export function validatePassword(pw: string): { ok: true } | { ok: false; key: "passwordTooShort" } {
  if (pw.length < MIN_PASSWORD_LENGTH) return { ok: false, key: "passwordTooShort" };
  return { ok: true };
}
