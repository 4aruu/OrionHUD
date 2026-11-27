import { describe, expect, it } from "vitest";
import { captureStyles, parseCaptureConfig } from "../src/content/captureConfig";
import { BEIGE, DARK } from "../src/shared/palette";

describe("parseCaptureConfig keeps today's rules", () => {
  it("rejects a bad mode", () => {
    expect(parseCaptureConfig({ mode: "nope", label: "x" })).toBeNull();
    expect(parseCaptureConfig(undefined)).toBeNull();
  });

  it("slices the label to 120 characters", () => {
    expect(parseCaptureConfig({ mode: "save", label: "a".repeat(300) })?.label).toHaveLength(120);
  });

  it("defaults a missing or unknown theme to system and keeps a valid one", () => {
    expect(parseCaptureConfig({ mode: "inbox", label: "x" })?.theme).toBe("system");
    expect(parseCaptureConfig({ mode: "inbox", label: "x", theme: "light" })?.theme).toBe("light");
    expect(parseCaptureConfig({ mode: "inbox", label: "x", theme: "neon" })?.theme).toBe("system");
  });
});

describe("captureStyles", () => {
  it("uses only variables outside the palette declarations", () => {
    for (const pref of ["system", "light", "dark"] as const) {
      const rest = captureStyles(pref).replace(/--[\w-]+:\s*[^;]+;/g, "");
      expect(rest, pref).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });

  it("system follows the page; explicit prefs pin one palette", () => {
    const system = captureStyles("system");
    expect(system).toContain("prefers-color-scheme: light");
    expect(system).toContain(BEIGE.surface);
    expect(system).toContain(DARK.surface);
    const dark = captureStyles("dark");
    expect(dark).toContain(DARK.surface);
    expect(dark).not.toContain(BEIGE.surface);
    expect(dark).not.toContain("prefers-color-scheme");
    const light = captureStyles("light");
    expect(light).toContain(BEIGE.surface);
    expect(light).not.toContain(DARK.surface);
  });
});
