import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// web/.nvmrc is the one Node version source. netlify.toml repeats it only
// because it must override a stale NODE_VERSION in the Netlify UI. These checks
// fail the run when the copies drift, which is how the UI ended up on 20.
const WEB = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");
const nvmrcMajor = read(".nvmrc").trim().replace(/^v/, "").split(".")[0];

describe("Node version sources agree", () => {
  it(".nvmrc names a major version", () => {
    expect(nvmrcMajor).toMatch(/^\d+$/);
  });

  it("netlify.toml NODE_VERSION equals .nvmrc", () => {
    const m = read("../netlify.toml").match(/^\s*NODE_VERSION\s*=\s*"([^"]+)"/m);
    expect(m, "netlify.toml has no NODE_VERSION; remove this check only after the Netlify UI variable is gone").not.toBeNull();
    expect(m![1].split(".")[0]).toBe(nvmrcMajor);
  });

  it("package.json engines is a floor at the .nvmrc major", () => {
    const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe(`>=${nvmrcMajor}`);
  });

  it("CI reads .nvmrc instead of repeating the version", () => {
    const ci = read("../.github/workflows/ci.yml");
    expect(ci).toMatch(/node-version-file:\s*web\/\.nvmrc/);
    expect(ci).not.toMatch(/node-version:\s*\d/);
  });
});
