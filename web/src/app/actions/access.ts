"use server";
import { headers } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { sendBestEffort } from "@/lib/email";
import { newAccessRequestEmail } from "@/lib/email/templates";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { Role } from "@prisma/client";

export type RequestAccessState = { status: "idle" | "sent" | "error"; message?: string };

const NEUTRAL: RequestAccessState = { status: "sent" };
const WINDOW_MS = 60 * 60_000;
const MAX_PER_IP = 10;

function reviewUrl(): string | undefined {
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}/app/operator/access-requests` : undefined;
}

export async function requestAccess(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  const ip = clientIp(await headers());
  if (await rateLimit(`request:${ip}`, MAX_PER_IP, WINDOW_MS)) {
    return { status: "error", message: "Demasiados intentos. Inténtalo más tarde." };
  }

  // Honeypot: real users never fill this hidden field.
  if (String(formData.get("company_site") ?? "").trim() !== "") return NEUTRAL;

  const businessName = String(formData.get("business") ?? "").trim();
  const contactName = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim() || null;

  if (!businessName || !contactName || !email || !phone) {
    return { status: "error", message: "Completa los campos obligatorios." };
  }

  // Enumeration-safe: if the email already has an account or a pending request,
  // show the same neutral screen and create no duplicate.
  const [existingUser, existingRequest] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.accessRequest.findFirst({ where: { email, status: "PENDING" } }),
  ]);
  if (existingUser || existingRequest) return NEUTRAL;

  await prisma.accessRequest.create({
    data: { businessName, contactName, email, phone, website, message },
  });

  // Notify operators AFTER the response is sent: keeps the response fast (so the
  // existing-vs-new branches return at comparable latency — no enumeration timing
  // oracle) and ensures a lookup/send failure can never reject the user's request.
  after(async () => {
    try {
      const operators = await prisma.user.findMany({
        where: { role: Role.SUPERADMIN, disabledAt: null },
        select: { email: true },
      });
      await Promise.all(
        operators.map((op) =>
          sendBestEffort(newAccessRequestEmail(op.email, { businessName, contactName, email, phone, website, message }, reviewUrl())),
        ),
      );
    } catch (err) {
      console.error("[access] operator notification failed:", err);
    }
  });

  return NEUTRAL;
}
