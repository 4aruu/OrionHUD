import { vi } from "vitest";

// Only mocks what's actually called by code under test. Add to this as
// more chrome.* surface gets exercised by orchestration-layer tests,
// don't pre-build a full chrome mock speculatively.
export function installChromeAlarmsMock() {
  const create = vi.fn();
  const clear = vi.fn();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    alarms: { create, clear },
  };
  return { create, clear };
}
