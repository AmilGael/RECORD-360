"use server";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { mailer, sendBestEffort } from "@/lib/email";
import { newAccessRequestEmail, accountActivationEmail } from "@/lib/email/templates";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { createActivationToken, activationUrl } from "@/lib/auth/tokens";
import { requireSuperAdmin } from "@/lib/auth/operator";
import { normalizeEmail } from "@/lib/auth/email";
import { writeAudit } from "@/lib/audit/log";
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
  const email = normalizeEmail(formData.get("email"));
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

const OPERATOR_PATH = "/app/operator/access-requests";

export async function approveRequest(formData: FormData): Promise<void> {
  const operator = await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));

  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") { revalidatePath(OPERATOR_PATH); return; } // idempotent no-op

  // If the email already has an account, resolve the request without creating a duplicate.
  const existing = await prisma.user.findUnique({ where: { email: req.email } });
  if (existing) {
    await prisma.accessRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", reviewedById: operator.id, reviewedAt: new Date() },
    });
    revalidatePath(OPERATOR_PATH);
    return;
  }

  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: req.businessName } });
    const created = await tx.user.create({
      data: { email: req.email, name: req.contactName, role: Role.ADMIN, companyId: company.id },
    });
    await tx.accessRequest.update({
      where: { id: req.id },
      data: {
        status: "APPROVED",
        reviewedById: operator.id,
        reviewedAt: new Date(),
        createdCompanyId: company.id,
        createdUserId: created.id,
      },
    });
    await writeAudit(tx, {
      companyId: company.id,
      actorId: operator.id,
      action: "access_request.approved",
      targetType: "Company",
      targetId: company.id,
      summary: `Approved access request for ${req.businessName} (${req.email})`,
    });
    return created;
  });

  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(req.email, req.contactName, activationUrl(raw)));
  revalidatePath(OPERATOR_PATH);
}

export async function rejectRequest(formData: FormData): Promise<void> {
  const operator = await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));
  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") { revalidatePath(OPERATOR_PATH); return; }
  await prisma.accessRequest.update({
    where: { id: req.id },
    data: { status: "REJECTED", reviewedById: operator.id, reviewedAt: new Date() },
  });
  revalidatePath(OPERATOR_PATH);
}

/** Re-mint + re-send the activation link for an approved request whose user is still unactivated. */
export async function resendActivation(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const requestId = String(formData.get("requestId"));
  const req = await prisma.accessRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "APPROVED" || !req.createdUserId) { revalidatePath(OPERATOR_PATH); return; }
  const user = await prisma.user.findUnique({ where: { id: req.createdUserId } });
  if (!user || user.emailVerifiedAt) { revalidatePath(OPERATOR_PATH); return; } // already activated
  const raw = await createActivationToken(user.id);
  await mailer.send(accountActivationEmail(user.email, user.name, activationUrl(raw)));
  revalidatePath(OPERATOR_PATH);
}
