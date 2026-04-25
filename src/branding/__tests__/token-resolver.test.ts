import { describe, it, expect } from "vitest";
import { resolveBrandTokens } from "../token-resolver";
import { defaultBrandConfig, DEFAULT_PRIMARY } from "../brand-defaults";
import type { BrandConfig } from "../brand-types";

describe("resolveBrandTokens", () => {
  it("emits both light and dark token maps", () => {
    const tokens = resolveBrandTokens(defaultBrandConfig);
    expect(tokens.light).toBeDefined();
    expect(tokens.dark).toBeDefined();
  });

  it("falls back to default primary when none provided", () => {
    const tokens = resolveBrandTokens(defaultBrandConfig);
    expect(tokens.light["--primary"]).toBe(DEFAULT_PRIMARY);
    expect(tokens.dark["--primary"]).toBe(DEFAULT_PRIMARY);
  });

  it("uses provided primary color in both themes", () => {
    const config: BrandConfig = {
      ...defaultBrandConfig,
      primaryColor: "210 80% 50%",
    };
    const tokens = resolveBrandTokens(config);
    expect(tokens.light["--primary"]).toBe("210 80% 50%");
    expect(tokens.dark["--primary"]).toBe("210 80% 50%");
  });

  it("derives a chart palette of 10 entries", () => {
    const tokens = resolveBrandTokens(defaultBrandConfig);
    for (let i = 1; i <= 10; i++) {
      expect(tokens.light[`--chart-${i}` as `--chart-${number}`]).toBeTruthy();
      expect(tokens.dark[`--chart-${i}` as `--chart-${number}`]).toBeTruthy();
    }
  });

  it("produces accessible primary foreground", () => {
    const config: BrandConfig = {
      ...defaultBrandConfig,
      primaryColor: "0 0% 5%",
    };
    const tokens = resolveBrandTokens(config);
    // Dark primary should pair with light foreground
    expect(tokens.light["--primary-foreground"]).toMatch(/100%|95%|90%/);
  });

  it("includes all critical semantic tokens", () => {
    const tokens = resolveBrandTokens(defaultBrandConfig);
    const required = [
      "--background",
      "--foreground",
      "--card",
      "--popover",
      "--primary",
      "--accent",
      "--muted",
      "--border",
      "--ring",
      "--success",
      "--warning",
      "--destructive",
      "--info",
      "--sidebar-background",
      "--surface-1",
      "--surface-elevated",
    ];
    for (const token of required) {
      expect(tokens.light[token as `--${string}`]).toBeTruthy();
      expect(tokens.dark[token as `--${string}`]).toBeTruthy();
    }
  });

  it("produces stable snapshot for default config", () => {
    const tokens = resolveBrandTokens(defaultBrandConfig);
    expect(tokens.light["--primary"]).toMatchInlineSnapshot(`"43 74% 49%"`);
    expect(tokens.dark["--primary"]).toMatchInlineSnapshot(`"43 74% 49%"`);
    expect(tokens.light["--success"]).toMatchInlineSnapshot(`"142 71% 45%"`);
    expect(tokens.dark["--destructive"]).toMatchInlineSnapshot(`"0 84% 60%"`);
  });
});
