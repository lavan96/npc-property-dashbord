import { describe, it, expect } from "vitest";
import { resolveBrandTokens, resolveBrandFontVars } from "../token-resolver";
import { defaultBrandConfig, defaultDarkTokenMap, defaultLightTokenMap } from "../brand-defaults";
import { resolveFontStack, resolveFontScale, SYSTEM_FONT_STACK } from "../brand-fonts";
import { parseHsl } from "../color-utils";
import type { BrandConfig } from "../brand-types";

// A deliberately non-gold, non-default brand so a regression to "everything
// follows the brand" is caught in both directions.
const rebranded: BrandConfig = {
  ...defaultBrandConfig,
  primaryColor: "285 90% 45%", // purple
  accentColor: "205 95% 45%", // blue
  brandColor: "180 70% 45%", // teal
};

// The semantic/functional tokens that MUST stay fixed regardless of the brand.
const SEMANTIC_TOKENS = [
  "--success",
  "--success-foreground",
  "--success-light",
  "--warning",
  "--warning-foreground",
  "--warning-light",
  "--destructive",
  "--destructive-foreground",
  "--destructive-light",
  "--info",
  "--info-foreground",
  "--info-light",
] as const;

describe("brand cascade", () => {
  it("cascades the brand colour to --brand and the brand ramp in both themes", () => {
    const { light, dark } = resolveBrandTokens(rebranded);

    expect(light["--brand"]).toBe("180 70% 45%");
    expect(dark["--brand"]).toBe("180 70% 45%");

    // The whole ramp is derived from the brand hue.
    for (const shade of [50, 100, 300, 500, 700, 950]) {
      const token = `--brand-${shade}` as const;
      expect(parseHsl(light[token]).h).toBe(180);
      expect(parseHsl(dark[token]).h).toBe(180);
    }
  });

  it("cascades primary and accent to the action/focus tokens", () => {
    const { light, dark } = resolveBrandTokens(rebranded);

    expect(light["--primary"]).toBe("285 90% 45%");
    expect(light["--ring"]).toBe("285 90% 45%");
    expect(light["--sidebar-primary"]).toBe("285 90% 45%");
    expect(light["--accent"]).toBe("205 95% 45%");

    expect(dark["--primary"]).toBe("285 90% 45%");
    expect(dark["--ring"]).toBe("285 90% 45%");
  });
});

describe("semantic tokens are fixed (never follow the brand)", () => {
  it("keeps warning/success/error/info at their defaults in LIGHT mode", () => {
    const { light } = resolveBrandTokens(rebranded);
    for (const token of SEMANTIC_TOKENS) {
      expect(light[token]).toBe(defaultLightTokenMap[token]);
    }
  });

  it("keeps warning/success/error/info at their defaults in DARK mode", () => {
    const { dark } = resolveBrandTokens(rebranded);
    for (const token of SEMANTIC_TOKENS) {
      expect(dark[token]).toBe(defaultDarkTokenMap[token]);
    }
  });

  it("warning stays amber-hued even when the brand is teal", () => {
    const { light, dark } = resolveBrandTokens(rebranded);
    // amber ≈ hue 43; teal brand is hue 180 — they must not converge.
    expect(parseHsl(light["--warning"]).h).toBe(43);
    expect(parseHsl(dark["--warning"]).h).toBe(43);
    expect(parseHsl(light["--warning"]).h).not.toBe(parseHsl(light["--brand"]).h);
  });
});

describe("font cascade", () => {
  it("resolves the body font from the White-Label selection", () => {
    const vars = resolveBrandFontVars({ ...defaultBrandConfig, fontFamily: "serif" });
    expect(vars["--font-sans"]).toBe(resolveFontStack("serif"));
    expect(vars["--font-sans"]).toContain("Georgia");
  });

  it("defaults the heading font to the body font when unset", () => {
    const vars = resolveBrandFontVars({ ...defaultBrandConfig, fontFamily: "grotesk", headingFontFamily: null });
    expect(vars["--font-heading"]).toBe(vars["--font-sans"]);
  });

  it("uses a distinct heading font when one is chosen", () => {
    const vars = resolveBrandFontVars({
      ...defaultBrandConfig,
      fontFamily: "serif",
      headingFontFamily: "system",
    });
    expect(vars["--font-heading"]).toBe(SYSTEM_FONT_STACK);
    expect(vars["--font-heading"]).not.toBe(vars["--font-sans"]);
  });

  it("applies the font scale to the base size", () => {
    expect(resolveBrandFontVars({ ...defaultBrandConfig, fontScale: "compact" })["--base-font-size"]).toBe(resolveFontScale("compact"));
    expect(resolveBrandFontVars({ ...defaultBrandConfig, fontScale: "comfortable" })["--base-font-size"]).toBe(resolveFontScale("comfortable"));
  });

  it("falls back to the system font stack when nothing is selected", () => {
    const vars = resolveBrandFontVars(defaultBrandConfig);
    expect(vars["--font-sans"]).toBe(SYSTEM_FONT_STACK);
    expect(vars["--base-font-size"]).toBe("1rem");
  });
});
