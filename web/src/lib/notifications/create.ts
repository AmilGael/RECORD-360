import { prisma } from "@/lib/db";

export type NewNotification = {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function createNotifications(items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  await prisma.notification.createMany({ data: items });
}
