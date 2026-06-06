import { ResendMailer } from "./resend";
import { LogMailer } from "./log";
import type { Mailer } from "./types";

/**
 * Pick the mailer from the environment. Setting RESEND_API_KEY (plus EMAIL_FROM)
 * sends real transactional email; without it, emails are logged only (dev).
 */
export function createMailer(env: Record<string, string | undefined>): Mailer {
  if (env.RESEND_API_KEY) {
    const from = env.EMAIL_FROM;
    if (!from) throw new Error("RESEND_API_KEY is set but EMAIL_FROM is missing.");
    return new ResendMailer(env.RESEND_API_KEY, from);
  }
  return new LogMailer();
}

export const mailer: Mailer = createMailer(process.env);

/** Send without letting a delivery failure break the calling flow. */
export async function sendBestEffort(msg: Parameters<Mailer["send"]>[0]): Promise<void> {
  try {
    await mailer.send(msg);
  } catch (err) {
    console.error(`[email] delivery failed for subject="${msg.subject}":`, err);
  }
}
