/** Project-level progress = rounded average of its partidas' progressPct. 0 when empty. */
export function projectProgress(partidas: { progressPct: number }[]): number {
  if (partidas.length === 0) return 0;
  const sum = partidas.reduce((acc, p) => acc + p.progressPct, 0);
  return Math.round(sum / partidas.length);
}
