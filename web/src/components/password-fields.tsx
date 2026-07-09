"use client";

/** The password + confirm pair used by the activate and reset pages.
 *  Field names are contract: server actions read "password" and "confirm".
 *  minLength mirrors MIN_PASSWORD_LENGTH (12) — the server re-validates. */
export function PasswordFields() {
  return (
    <>
      <input name="password" type="password" placeholder="Nueva contraseña" required minLength={12} className="input" style={{ marginBottom: 10 }} autoComplete="new-password" />
      <input name="confirm" type="password" placeholder="Confirmar contraseña" required minLength={12} className="input" style={{ marginBottom: 18 }} autoComplete="new-password" />
    </>
  );
}
