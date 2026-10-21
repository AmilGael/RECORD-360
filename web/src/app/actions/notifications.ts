"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireFreshSession } from "@/lib/auth/session";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const user = await requireFreshSession();

  const id = String(formData.get("id"));
  // Keep the first read time: a second call matches 0 rows and leaves readAt.
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  // Layout scope: the unread badge lives in app/app/layout.tsx, shared by every
  // /app route (see revalidateAppShell in app/actions/lifecycle.ts).
  revalidatePath("/app", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireFreshSession();

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  // Layout scope: the unread badge lives in app/app/layout.tsx, shared by every
  // /app route (see revalidateAppShell in app/actions/lifecycle.ts).
  revalidatePath("/app", "layout");
}
