import { CredentialsSignin } from "next-auth";

/**
 * Thrown from authorize while the email+IP pair is locked out. Auth.js rethrows
 * AuthError subclasses unchanged to a server-side signIn(..., { redirect: false })
 * caller, so login/page.tsx can read `code` and show the lockout message.
 * The lockout applies whether or not the account exists, so the message
 * reveals nothing about which emails are registered.
 */
export class LockedOutSignin extends CredentialsSignin {
  code = "locked";
}
