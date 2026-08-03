import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Next.js enforces that a "use server" module exports ONLY async functions.
// Anything else — a number, a string, an object, a class — is rejected when the
// module is loaded, with:
//
//   A "use server" file can only export async functions, found number
//
// In development that surfaces as a runtime-error overlay. In production it is a
// bare "Application error: a server-side exception has occurred", with no clue
// which file or symbol caused it.
//
// This is exactly what took down the entire informes flow: informes.ts carried
// `export const PENDING_STALE_MS = 3 * 60_000`, so createInforme could never
// run and not a single Informe row was ever written. The constant was only used
// inside that file — the `export` was gratuitous, and it cost the feature.
//
// Type-only exports (`export type` / `export interface`) are erased by the TS
// compiler and never reach Next, so they are allowed.
const ACTIONS_DIR = path.join(__dirname, "..", "src", "app", "actions");

function useServerFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /^\s*["']use server["']/m.test(readFileSync(path.join(ACTIONS_DIR, f), "utf8").split("\n")[0]));
}

describe('"use server" modules export only async functions', () => {
  const files = useServerFiles();

  it("finds the server-action modules to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s exports only async functions", (file) => {
    const src = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => line.startsWith("export "))
      // Erased at compile time — never seen by the Next.js runtime.
      .filter(({ line }) => !/^export\s+(type|interface)\b/.test(line))
      // The only legal runtime export shape.
      .filter(({ line }) => !/^export\s+async\s+function\b/.test(line))
      .map(({ line, n }) => `${file}:${n} → ${line.slice(0, 80)}`);

    expect(offenders).toEqual([]);
  });
});
