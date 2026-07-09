"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const user = await requireFreshSession();

  const id = String(formData.get("id"));
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireFreshSession();

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}
