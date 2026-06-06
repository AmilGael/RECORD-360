"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");

  const id = String(formData.get("id"));
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}
