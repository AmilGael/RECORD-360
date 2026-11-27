"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { BackButton } from "@/components/back-button";

/**
 * Volver for every screen under a project. The shared project layout renders
 * it, and a layout cannot read searchParams on the server, so the screen's
 * logical parent is worked out here:
 *  - the obra overview (index, no bloque open) goes up to the obras list;
 *  - a solicitud detail goes up to the Solicitudes tab;
 *  - everything else (a bloque workspace, any other tab) goes to the obra.
 */
export function ProjectBackButton({
  projectId,
  labels,
}: {
  projectId: string;
  labels: { label: string; aria: string };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/app/projects/${projectId}`;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  let fallbackHref = base;
  if (path === base && !searchParams.get("block")) fallbackHref = "/app";
  else if (path.startsWith(`${base}/cambios/`)) fallbackHref = `${base}/solicitudes`;

  return <BackButton fallbackHref={fallbackHref} labels={labels} />;
}
