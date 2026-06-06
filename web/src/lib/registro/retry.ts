// Concurrent appends to the same partida can read the same chain tip and then
// collide on the @@unique([partidaId, prevHash]) constraint (Prisma error
// P2002). The chain stays correct — the constraint guarantees it — but the
// losing writer would otherwise get a spurious failure. Retrying re-reads the
// new tip and links onto it, so honest concurrent writes both succeed.

function isUniqueConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function retryOnConflict<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
