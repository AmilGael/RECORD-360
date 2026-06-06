import type { EmailMessage, Mailer } from "./types";

/**
 * Dev/no-key fallback: instead of sending, log that an email *would* have been
 * sent. Keeps flows working locally without a Resend key and never leaks the
 * body (e.g. temp passwords) into logs.
 */
export class LogMailer implements Mailer {
  async send(msg: EmailMessage): Promise<void> {
    console.info(`[email:log] would send to=${msg.to} subject="${msg.subject}" (no RESEND_API_KEY set)`);
  }
}
