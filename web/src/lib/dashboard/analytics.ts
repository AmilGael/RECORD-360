import { healthLevel, type Health } from "@/lib/project/health";

export type DashboardProjectRow = {
  id: string;
  name: string;
  progress: number;
  partidas: number;
  openChanges: number;
  overdueReminders: number;
  latestAuthor: string | null;
  latestTime: string | null;
  latestHash: string | null;
};

export type DashboardAnalytics = {
  totalProjects: number;
  totalPartidas: number;
  avgProgress: number;
  openChanges: number;
  overdueReminders: number;
  portfolioHealth: Health;
  healthCounts: Record<Health, number>;
  topRiskProjects: Array<DashboardProjectRow & { health: Health; riskScore: number }>;
};

export function buildDashboardAnalytics(rows: DashboardProjectRow[]): DashboardAnalytics {
  const healthCounts: Record<Health, number> = { red: 0, yellow: 0, green: 0 };
  let totalPartidas = 0;
  let openChanges = 0;
  let overdueReminders = 0;
  let progressSum = 0;

  const enriched = rows.map((row) => {
    const health = healthLevel(row.progress);
    const riskScore = (row.overdueReminders * 10) + (row.openChanges * 3) + (100 - row.progress);
    healthCounts[health] += 1;
    totalPartidas += row.partidas;
    openChanges += row.openChanges;
    overdueReminders += row.overdueReminders;
    progressSum += row.progress;
    return { ...row, health, riskScore };
  });

  const avgProgress = rows.length === 0 ? 0 : Math.round(progressSum / rows.length);

  return {
    totalProjects: rows.length,
    totalPartidas,
    avgProgress,
    openChanges,
    overdueReminders,
    portfolioHealth: healthLevel(avgProgress),
    healthCounts,
    topRiskProjects: [...enriched]
      .sort((a, b) => b.riskScore - a.riskScore || a.progress - b.progress || a.name.localeCompare(b.name))
      .slice(0, 4),
  };
}
