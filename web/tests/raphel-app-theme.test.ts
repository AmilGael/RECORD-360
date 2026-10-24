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
      for (const token of ["--shadow-soft", "--shadow-card"]) {
        const value = map.get(token);
        expect(value, token).toBeTruthy();
        // A hard offset plane is `x y 0 color`; each layer here must blur.
        for (const layer of value!.split(/,(?![^(]*\))/)) {
          const lengths = layer.trim().match(/-?\d*\.?\d+px|\b0\b/g) ?? [];
          expect(lengths.length, `${token}: ${layer}`).toBeGreaterThanOrEqual(3);
          expect(lengths[2], `${token} blur: ${layer}`).not.toMatch(/^0(px)?$/);
        }
      }
    }
  });
});

describe("raphel-app.css scope", () => {
  it("scopes every rule selector under .raphel-app, @media rules included", () => {
    expect(rules.length).toBeGreaterThan(0);
    const unscoped: string[] = [];
    for (const r of rules) {
      for (const sel of r.selector.split(",").map((s) => s.trim())) {
        if (!(sel.startsWith(DAY) || sel.startsWith(NIGHT))) unscoped.push(`${r.atRule ?? ""} ${sel}`.trim());
      }
    }
    expect(unscoped).toEqual([]);
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
  }

  it("night accent takes dark text #171412", () => {
    expect(block(NIGHT).get("--on-accent")).toBe("#171412");
  });

  it("the primary button paints its text with the on-accent tokens", () => {
    expect(block(".raphel-app .btn-accent").get("color")).toBe("var(--on-accent)");
    expect(block(".raphel-app .btn-accent:hover").get("color")).toBe("var(--on-accent-deep)");
  });
});
