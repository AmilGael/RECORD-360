import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

const FILES = [
  "node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js",
  "node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js",
  "node_modules/next/dist/compiled/react-dom/cjs/react-dom-profiling.development.js",
  "node_modules/next/dist/compiled/react-dom/cjs/react-dom-profiling.profiling.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-client.development.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-client.production.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-profiling.development.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-profiling.profiling.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-unstable_testing.development.js",
  "node_modules/next/dist/compiled/react-dom-experimental/cjs/react-dom-unstable_testing.production.js",
];

// The dropped-ping line. Development builds wrap it onto a second line
// ("=== NoContext &&" / "prepareFreshStack(root, 0)"), so match any whitespace.
const OLD = /&&\s*prepareFreshStack\(root, 0\)/;
const FIXED_PROD =
  "0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)";
const FIXED_DEV =
  "(executionContext & RenderContext) === NoContext ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)";

// Two different failures, two different fixes. The usual one is a node_modules
// the patch never reached (install with --ignore-scripts, a skipped or failed
// postinstall): the old line is still there, and the fix is to re-apply.
// Deleting the patch is right only when the old line is gone because the
// bundled React changed it itself.
const NOT_APPLIED =
  "The ping-during-render patch is not applied to node_modules. Run `npm install` (or `npx patch-package`). Do NOT delete patches/next+15.5.18.patch: this react-dom still drops pings during render.";
const DROP =
  "The bundled react-dom no longer has the line the ping-during-render patch targets. If this Next version's React keeps pings that arrive during render (react/react#37805), delete patches/next+15.5.18.patch and the postinstall script; if not, re-make the patch for it.";

describe("bundled react-dom keeps pings that arrive during render", () => {
  it("applies the upstream ternary in every Next 15.5.18 react-dom copy", () => {
    for (const rel of FILES) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      expect(OLD.test(source), `${rel}\n${NOT_APPLIED}`).toBe(false);
      expect(source.includes(FIXED_PROD) || source.includes(FIXED_DEV), `${rel}\n${DROP}`).toBe(true);
    }
  });
});
