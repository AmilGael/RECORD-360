import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { projectAccessWhere } from "@/lib/authz/projects";

/**
 * The project with its bloques, partidas and assignments, scoped by
 * `projectAccessWhere`: a missing id and another tenant's id both give null.
 *
 * Wrapped in React `cache` so the shared layout (header) and the route page
 * under it run the query once per request. The arguments are primitives on
 * purpose: `cache` compares them by identity, and a fresh user object per call
 * would defeat it.
 */
export const loadProject = cache(
  async (id: string, userId: string, companyId: string, role: Role) =>
    prisma.project.findFirst({
      where: { id, ...projectAccessWhere({ id: userId, companyId, role }) },
      include: {
        company: { select: { name: true } },
        assignments: {
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        segments: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: {
            partidas: {
              where: { deletedAt: null },
              orderBy: { createdAt: "asc" },
              include: { tags: { include: { tag: { select: { name: true } } } } },
            },
          },
        },
        partidas: {
          where: { segmentId: null, deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { tags: { include: { tag: { select: { name: true } } } } },
        },
      },
    }),
);
