"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { SlideRow } from "@/components/slide-row";
import { BarChart, Branch, FileText, Folder, Layers } from "@/components/icons";
import {
  PROJECT_TABS,
  activeProjectTab,
  projectTabHref,
  type ProjectTabId,
} from "@/lib/project/tabs";

const ICONS: Record<ProjectTabId, ComponentType<{ size?: number }>> = {
  partidas: Layers,
  planos: Folder,
  solicitudes: Branch,
  analitica: BarChart,
  informes: FileText,
};

/**
 * The project's tab strip. Each tab is a real route, so the active one comes
 * from the pathname. The row slides sideways when the labels do not fit
 * (phones, long Spanish labels) instead of wrapping or widening the page.
 */
export function ProjectTabs({
  projectId,
  labels,
  ariaLabel,
}: {
  projectId: string;
  labels: Record<ProjectTabId, string>;
  ariaLabel: string;
}) {
  const pathname = usePathname();
  const active = activeProjectTab(pathname, projectId);

  return (
    <nav aria-label={ariaLabel}>
      <SlideRow className="tabs project-tabs" activeKey={pathname}>
        {PROJECT_TABS.map((tab) => {
          const Icon = ICONS[tab.id];
          const on = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={projectTabHref(projectId, tab.id)}
              className={`tab ${on ? "is-on" : ""}`}
              aria-current={on ? "page" : undefined}
            >
              <Icon size={13} />
              {labels[tab.id]}
            </Link>
          );
        })}
      </SlideRow>
    </nav>
  );
}
