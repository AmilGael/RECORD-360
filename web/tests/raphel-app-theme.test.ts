import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The /app look lives in one stylesheet scoped under `.raphel-app`, so the
// landing page and the auth screens keep rendering from globals.css untouched.
// These checks read the stylesheet as text: no browser, no database.

const CSS_PATH = path.resolve(__dirname, "../src/app/app/raphel-app.css");
const LAYOUT_PATH = path.resolve(__dirname, "../src/app/app/layout.tsx");

const DAY = ".raphel-app";
const NIGHT = 'body[data-theme="dark"] .raphel-app';

type Rule = { selector: string; body: string; atRule: string | null };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Index of the `}` matching the `{` at `open`. */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced brace at ${open}`);
}

/**
 * Flat list of style rules. Rules inside @media / @supports are returned with
 * their at-rule; @keyframes bodies are skipped (their "selectors" are 0%, to).
 */
function parseRules(css: string, atRule: string | null = null): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);
    if (prelude.startsWith("@keyframes") || prelude.startsWith("@-webkit-keyframes")) {
      // animation steps, not selectors
    } else if (prelude.startsWith("@")) {
      rules.push(...parseRules(body, prelude));
    } else {
      rules.push({ selector: prelude, body, atRule });
    }
    i = close + 1;
  }
  return rules;
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (prop) map.set(prop, value);
  }
  return map;
}

const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();

const css = stripComments(readFileSync(CSS_PATH, "utf8"));
const rules = parseRules(css);

/** Declarations of the top-level rule whose selector is exactly `selector`. */
function block(selector: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const r of rules) {
    if (r.atRule === null && r.selector === selector) {
      for (const [k, v] of declarations(r.body)) merged.set(k, v);
    }
  }
  return merged;
}

// Global Constraints of the redesign plan, verbatim.
const NIGHT_TOKENS: Record<string, string> = {
  "--paper": "#171412",
  "--paper-2": "#1f1b18",
  "--paper-3": "#292420",
  "--ink": "#f1e7d8",
  "--ink-soft": "#d4c7b7",
  "--steel": "#b5a998",
  "--accent": "#ff6f43",
  "--accent-deep": "#e85a2c",
  "--state-active": "#5bbd8d",
  "--state-merged": "#a388e4",
  "--state-blocked": "#e06a54",
  "--line": "rgba(241,231,216,0.12)",
  "--line-strong": "rgba(241,231,216,0.22)",
  "--grid": "rgba(241,231,216,0.03)",
};

const DAY_TOKENS: Record<string, string> = {
  "--paper": "#ECE7DD",
  "--paper-2": "#E3DDD0",
  "--paper-3": "#DBD4C5",
  "--ink": "#19140F",
  "--ink-soft": "#4A433A",
  "--accent": "#E14A1F",
  "--accent-deep": "#B83814",
  "--line": "rgba(25,20,15,0.14)",
  "--line-strong": "rgba(25,20,15,0.26)",
  "--grid": "rgba(25,20,15,0.045)",
};

/**
 * A selector is scoped when it starts with `.raphel-app` (or the night form)
 * followed by end, a descendant/child step, or a compound on the wrapper
 * itself (`.x`, `:x`, `[x]`), never a sibling combinator. The two body
 * selectors are allowed whole: only /app pages contain .raphel-app.
 */
const BODY_GROUND = new Set(["body:has(.raphel-app)", 'body[data-theme="dark"]:has(.raphel-app)']);
function isScoped(sel: string): boolean {
  if (BODY_GROUND.has(sel)) return true;
  const prefix = [NIGHT, DAY].find((p) => sel.startsWith(p));
  if (!prefix) return false;
  const rest = sel.slice(prefix.length);
  if (/^\s*[~+]/.test(rest)) return false;
  return rest === "" || /^[\s.:[>]/.test(rest);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hexOf(map: Map<string, string>, token: string): string {
  const value = map.get(token);
  if (!value || !/^#[0-9a-f]{3,6}$/i.test(value)) throw new Error(`${token} is not a hex color: ${value}`);
  return value;
}

const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const rgbOf = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));

/** `color` laid at `alpha` over the opaque `ground`, as the browser composites a tint. */
function over(color: string, alpha: number, ground: string): string {
  const [c, g] = [rgbOf(color), rgbOf(ground)];
  return toHex(c.map((v, i) => v * alpha + g[i] * (1 - alpha)));
}

/** The rgb and alpha of an `rgba(r, g, b, a)` token. */
function rgbaOf(map: Map<string, string>, token: string): { hex: string; alpha: number } {
  const m = (map.get(token) ?? "").match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (!m) throw new Error(`${token} is not an rgba() color: ${map.get(token)}`);
  return { hex: toHex([+m[1], +m[2], +m[3]]), alpha: +m[4] };
}

/** Shadow layers without a blur radius (`x y 0 color`), insets excepted. */
function hardLayers(value: string): string[] {
  if (/^(none|var\([^)]*\))$/.test(value.trim())) return [];
  return value
    .split(/,(?![^(]*\))/)
    .map((l) => l.trim())
    .filter((l) => !/\binset\b/.test(l) && !/^var\(/.test(l))
    .filter((l) => {
      const lengths = l.replace(/\([^)]*\)/g, "").match(/-?\d*\.?\d+(px|rem|em)?/g) ?? [];
      return lengths.length < 3 || /^-?0(\.0+)?(px|rem|em)?$/.test(lengths[2]);
    });
}

describe("raphel-app.css tokens", () => {
  it("declares every night token under the night selector", () => {
    const night = block(NIGHT);
    for (const [token, value] of Object.entries(NIGHT_TOKENS)) {
      expect(norm(night.get(token) ?? ""), token).toBe(norm(value));
    }
  });

  it("declares every day token under .raphel-app", () => {
    const day = block(DAY);
    for (const [token, value] of Object.entries(DAY_TOKENS)) {
      expect(norm(day.get(token) ?? ""), token).toBe(norm(value));
    }
  });

  it("rounds planes at 10px and small controls at 6px", () => {
    const day = block(DAY);
    expect(day.get("--radius")).toBe("10px");
    expect(day.get("--radius-sm")).toBe("6px");
  });

  it("uses soft shadows only: every shadow token has a blur radius", () => {
    for (const map of [block(DAY), block(NIGHT)]) {
      for (const token of ["--shadow-soft", "--shadow-card", "--shadow-sheet"]) {
        const value = map.get(token);
        expect(value, token).toBeTruthy();
        expect(hardLayers(value!), token).toEqual([]);
      }
    }
  });

  it("the hard-shadow scan catches the retired offset planes", () => {
    expect(hardLayers("2px 2px 0 rgba(0, 0, 0, 0.30)")).toHaveLength(1);
    expect(hardLayers("6px 7px 0 var(--accent-deep)")).toHaveLength(1);
    expect(hardLayers("0 1px 2px rgba(0, 0, 0, 0.22), 5px 6px 0px #000")).toHaveLength(1);
    expect(hardLayers("0 1px 2px rgba(0, 0, 0, 0.22), 0 16px 34px -20px rgba(0, 0, 0, 0.5)")).toEqual([]);
    expect(hardLayers("inset 2px 0 0 var(--accent)")).toEqual([]);
    expect(hardLayers("none")).toEqual([]);
  });

  it("has no zero-blur box-shadow literal in any override rule", () => {
    const hard: string[] = [];
    for (const r of rules) {
      const value = declarations(r.body).get("box-shadow");
      if (value) hard.push(...hardLayers(value).map((l) => `${r.selector}: ${l}`));
    }
    expect(hard).toEqual([]);
  });
});

describe("raphel-app.css scope", () => {
  it("scopes every rule selector under .raphel-app, @media rules included", () => {
    expect(rules.length).toBeGreaterThan(0);
    const unscoped: string[] = [];
    for (const r of rules) {
      for (const sel of r.selector.split(",").map((s) => s.trim())) {
        if (!isScoped(sel)) unscoped.push(`${r.atRule ?? ""} ${sel}`.trim());
      }
    }
    expect(unscoped).toEqual([]);
  });

  it("the scope check rejects look-alike and sibling selectors", () => {
    for (const ok of [".raphel-app", ".raphel-app .btn", ".raphel-app.grid-bg", ".raphel-app > #sheet-root", ".raphel-app ::selection", ".raphel-app:hover .x", ".raphel-app[data-x]", `${NIGHT} .btn`, "body:has(.raphel-app)", 'body[data-theme="dark"]:has(.raphel-app)']) {
      expect(isScoped(ok), ok).toBe(true);
    }
    for (const bad of [".raphel-appx", ".raphel-app-x .btn", ".raphel-app ~ .btn", ".raphel-app + .btn", ".raphel-app~.btn", `${NIGHT} ~ .btn`, ".btn", "body", "body:has(.raphel-app) .btn", 'body[data-theme="dark"] .btn']) {
      expect(isScoped(bad), bad).toBe(false);
    }
  });

  it("paints the body behind the wrapper in the /app ground, only when the page holds .raphel-app", () => {
    expect(block("body:has(.raphel-app)").get("background-color")).toBe(DAY_TOKENS["--paper"]);
    expect(block('body[data-theme="dark"]:has(.raphel-app)').get("background-color")).toBe(NIGHT_TOKENS["--paper"]);
  });

  it("draws the fine 14px hairline grid on the .raphel-app.grid-bg ground", () => {
    const ground = block(".raphel-app.grid-bg");
    const image = norm(ground.get("background-image") ?? "");
    expect(image).toContain("linear-gradient(var(--grid)1px,transparent1px)");
    expect(image).toContain("linear-gradient(90deg,var(--grid)1px,transparent1px)");
    expect(norm(ground.get("background-size") ?? "")).toBe("14px14px");
    expect(ground.get("background-color")).toBe("var(--paper)");
    expect(ground.get("background-attachment")).toBe("fixed");
  });

  it("removes the chamfer from buttons and rounds them with --radius-sm", () => {
    const btn = block(".raphel-app .btn");
    expect(btn.get("clip-path")).toBe("none");
    expect(btn.get("border-radius")).toBe("var(--radius-sm)");
  });

  it("is imported by the /app layout, which carries the class and the sheet portal root", () => {
    const layout = readFileSync(LAYOUT_PATH, "utf8");
    expect(layout).toMatch(/import\s+["']\.\/raphel-app\.css["']/);
    expect(layout).toMatch(/className="raphel-app grid-bg"/);
    expect(layout).toMatch(/<div id="sheet-root"\s*\/>\s*<\/div>\s*\);\s*}\s*$/);
  });
});

describe("raphel-app.css contrast (WCAG AA, 4.5:1)", () => {
  const themes = [
    ["night", block(NIGHT)],
    ["day", block(DAY)],
  ] as const;

  for (const [name, map] of themes) {
    it(`${name}: ink and soft ink on the ground`, () => {
      const paper = hexOf(map, "--paper");
      expect(contrast(hexOf(map, "--ink"), paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexOf(map, "--ink-soft"), paper)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: button text on the accent fill, at rest and on hover`, () => {
      expect(contrast(hexOf(map, "--on-accent"), hexOf(map, "--accent"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexOf(map, "--on-accent-deep"), hexOf(map, "--accent-deep"))).toBeGreaterThanOrEqual(4.5);
    });

    const planes = ["--paper", "--paper-2", "--paper-3"].map((t) => hexOf(map, t));

    it(`${name}: --accent-text on every plane and on a 10-12% accent tint over it`, () => {
      const text = hexOf(map, "--accent-text");
      const accent = hexOf(map, "--accent");
      for (const plane of planes) {
        expect(contrast(text, plane), `on ${plane}`).toBeGreaterThanOrEqual(4.5);
        for (const alpha of [0.08, 0.1, 0.12]) {
          expect(contrast(text, over(accent, alpha, plane)), `on ${alpha} tint over ${plane}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    // Badge text on its own tint. Night blocked (#e06a54, pinned) is checked
    // on --paper and --paper-2 only: over --paper-3 even the bare color is 4.65:1
    // and any tint drops it under 4.5:1.
    const tinted: [string, string, number][] = [
      ["--state-active", "--state-active-bg", 3],
      ["--brass", "--brass-bg", 3],
      ["--state-blocked", "--state-blocked-bg", name === "night" ? 2 : 3],
    ];
    for (const [text, bg, count] of tinted) {
      it(`${name}: ${text} text on ${bg}`, () => {
        const tint = rgbaOf(map, bg);
        for (const plane of planes.slice(0, count)) {
          expect(contrast(hexOf(map, text), over(tint.hex, tint.alpha, plane)), `over ${plane}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it("accent used as text points at --accent-text", () => {
    for (const sel of [".raphel-app .form-error", ".raphel-app .cr-cost", ".raphel-app .role-badge.is-admin", ".raphel-app .aging-mark.is-14", ".raphel-app .media-group a"]) {
      const rule = rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(sel));
      expect(rule && declarations(rule.body).get("color"), sel).toBe("var(--accent-text)");
    }
  });

  it("supervisor avatar initials are dark on the #b08a2e fill", () => {
    const color = block(".raphel-app .avatar.role-supervisor").get("color")!;
    expect(contrast(color, "#b08a2e")).toBeGreaterThanOrEqual(4.5);
  });

  it("night accent takes dark text #171412", () => {
    expect(block(NIGHT).get("--on-accent")).toBe("#171412");
  });

  it("the primary button paints its text with the on-accent tokens", () => {
    expect(block(".raphel-app .btn-accent").get("color")).toBe("var(--on-accent)");
    expect(block(".raphel-app .btn-accent:hover").get("color")).toBe("var(--on-accent-deep)");
  });
});

describe("raphel-app.css progress pulse", () => {
  const GLOBALS = stripComments(readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8"));
  const BANDS = [".raphel-app .progress-fill", ".raphel-app .plate-band", ".raphel-app .dash-health-fill"];
  const selectors = (r: Rule) => r.selector.split(",").map((s) => s.trim().replace(/:not\([^)]*\)/g, ""));
  const pulseRules = rules.filter((r) => r.atRule === null && selectors(r).includes(".raphel-app .pulse-band"));

  /** Properties a @keyframes block animates, looked up in either stylesheet. */
  function keyframeProps(name: string): string[] {
    for (const source of [css, GLOBALS]) {
      const at = source.search(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
      if (at === -1) continue;
      const open = source.indexOf("{", at);
      const body = source.slice(open + 1, matchBrace(source, open));
      return [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    }
    throw new Error(`@keyframes ${name} not found`);
  }

  it("defines .pulse-band on the progress bands", () => {
    expect(pulseRules.length).toBeGreaterThan(0);
    const covered = pulseRules.flatMap(selectors);
    for (const band of BANDS) expect(covered, band).toContain(band);
  });

  it("keeps the bar-grow entrance and loops after it", () => {
    const animation = pulseRules.map((r) => declarations(r.body).get("animation") ?? "").join(",");
    expect(animation).toContain("bar-grow");
    expect(animation).toMatch(/infinite/);
  });

  it("animates opacity or transform only (never width)", () => {
    const animation = pulseRules.map((r) => declarations(r.body).get("animation") ?? "").join(",");
    const names = [...animation.matchAll(/\b(bar-grow|raphel-[a-z-]+)\b/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) {
      for (const prop of keyframeProps(name)) expect(["opacity", "transform"], `${name} animates ${prop}`).toContain(prop);
    }
  });

  it("is switched off under prefers-reduced-motion", () => {
    const off = rules.filter((r) =>
      r.atRule !== null && /prefers-reduced-motion:\s*reduce/.test(r.atRule) &&
      selectors(r).includes(".raphel-app .pulse-band") &&
      norm(declarations(r.body).get("animation") ?? "") === "none");
    expect(off.length).toBeGreaterThan(0);
  });
});
