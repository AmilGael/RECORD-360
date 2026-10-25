import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The project tabs are routes now. `?tab=` survives only inside the legacy
// redirect in src/lib/project/tabs.ts; any other use would send people through
// a redirect hop (or, for a new link, back to the old URL shape).
const SRC = path.resolve(__dirname, "../src");
const ALLOWED = path.join(SRC, "lib/project/tabs.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("no legacy ?tab= links", () => {
  it("appears nowhere in src except the legacy redirect", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file === ALLOWED) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/[?&]tab=/.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
