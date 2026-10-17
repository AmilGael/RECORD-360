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

const OLD = "&& prepareFreshStack(root, 0)";
const FIXED_PROD =
  "0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)";
const FIXED_DEV =
  "(executionContext & RenderContext) === NoContext ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)";

const DROP =
  "Drop the ping-during-render patch: delete patches/next+15.5.18.patch and the postinstall script. This Next version's bundled React already keeps pings that arrive during render (react/react#37805).";

describe("bundled react-dom keeps pings that arrive during render", () => {
  it("applies the upstream ternary in every Next 15.5.18 react-dom copy", () => {
    expect(FILES, DROP).toHaveLength(10);
    for (const rel of FILES) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      expect(source.includes(OLD), `${rel}\n${DROP}`).toBe(false);
      expect(source.includes(FIXED_PROD) || source.includes(FIXED_DEV), `${rel}\n${DROP}`).toBe(true);
    }
  });
});
