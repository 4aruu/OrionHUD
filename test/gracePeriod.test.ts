import { describe, it, expect } from "vitest";
import { evaluateGracePeriod } from "../src/shared/gracePeriod";

const MINUTE = 60_000;
const NOW = 1_700_000_000_000; // fixed timestamp for determinism

describe("evaluateGracePeriod", () => {
  it("returns 'ok' when not on a blacklisted domain", () => {
    expect(evaluateGracePeriod(null, 5, NOW)).toBe("ok");
  });

  it("returns 'grace' immediately after landing on blacklisted domain", () => {
    // Just arrived (0 ms elapsed), 5-minute grace
    expect(evaluateGracePeriod(NOW, 5, NOW)).toBe("grace");
  });

  it("returns 'grace' within the grace period", () => {
    const blacklistedSince = NOW - 3 * MINUTE; // 3 min ago
    expect(evaluateGracePeriod(blacklistedSince, 5, NOW)).toBe("grace");
  });

  it("returns 'expired' exactly at the grace period boundary", () => {
    const blacklistedSince = NOW - 5 * MINUTE; // exactly at limit
    expect(evaluateGracePeriod(blacklistedSince, 5, NOW)).toBe("expired");
  });

  it("returns 'expired' well past the grace period", () => {
    const blacklistedSince = NOW - 30 * MINUTE;
    expect(evaluateGracePeriod(blacklistedSince, 5, NOW)).toBe("expired");
  });

  it("respects a 0-minute grace period (instant expiry)", () => {
    // 0-min grace: any time on a blacklisted site is immediately expired
    expect(evaluateGracePeriod(NOW - 1, 0, NOW)).toBe("expired");
  });

  it("respects a long grace period", () => {
    const blacklistedSince = NOW - 20 * MINUTE;
    expect(evaluateGracePeriod(blacklistedSince, 60, NOW)).toBe("grace");
  });
});
