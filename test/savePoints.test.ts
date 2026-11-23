import { describe, expect, it } from "vitest";
import {
  buildSavePoint,
  classifyUrl,
  formatAgo,
  isRestorableUrl,
  latestNextStep,
  latestTabs,
  pushCapped,
  sanitizeTabs,
  shouldShowResume,
} from "../src/shared/savePoints";
import type { ISavePoint } from "../src/shared/types";

describe("isRestorableUrl", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "chrome://settings",
    "chrome-extension://abc/page.html",
    "file:///C:/secrets.txt",
    "blob:https://x.com/uuid",
    "about:blank",
    "https://user:pass@example.com/",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isRestorableUrl(url)).toBe(false);
  });

  it("rejects non-strings and oversized URLs", () => {
    expect(isRestorableUrl(undefined)).toBe(false);
    expect(isRestorableUrl(42)).toBe(false);
    expect(isRestorableUrl(`https://x.com/${"a".repeat(3000)}`)).toBe(false);
  });

  it("accepts http and https", () => {
    expect(isRestorableUrl("https://github.com/org/repo/pull/1")).toBe(true);
    expect(isRestorableUrl("http://localhost:5173/")).toBe(true);
  });
});

describe("classifyUrl", () => {
  it("recognizes AI threads by host and path", () => {
    expect(classifyUrl("https://claude.ai/chat/123")).toEqual({ kind: "ai-thread", vendor: "Claude" });
    expect(classifyUrl("https://chatgpt.com/c/abc")).toEqual({ kind: "ai-thread", vendor: "ChatGPT" });
    expect(classifyUrl("https://github.com/copilot/c/1")).toEqual({ kind: "ai-thread", vendor: "GitHub Copilot" });
  });

  it("does not treat regular GitHub or lookalike hosts as AI threads", () => {
    expect(classifyUrl("https://github.com/org/repo").kind).toBe("page");
    expect(classifyUrl("https://claude.ai.evil.com/chat").kind).toBe("page");
    expect(classifyUrl("https://notclaude.ai/").kind).toBe("page");
  });
});

describe("sanitizeTabs", () => {
  it("drops unsafe, pinned, and duplicate tabs; AI threads first", () => {
    const tabs = sanitizeTabs([
      { url: "https://docs.rs/tokio", title: "tokio docs" },
      { url: "chrome://extensions", title: "ext" },
      { url: "https://mail.example.com", title: "mail", pinned: true },
      { url: "https://chatgpt.com/c/1", title: "  Retry   design  " },
      { url: "https://docs.rs/tokio", title: "dup" },
      { url: "javascript:alert(1)", title: "x" },
    ]);
    expect(tabs.map((t) => t.url)).toEqual(["https://chatgpt.com/c/1", "https://docs.rs/tokio"]);
    expect(tabs[0]).toMatchObject({ kind: "ai-thread", vendor: "ChatGPT", title: "Retry design" });
  });

  it("caps at 30 tabs and clamps titles", () => {
    const raw = Array.from({ length: 40 }, (_, i) => ({ url: `https://x.com/${i}`, title: "t".repeat(500) }));
    const tabs = sanitizeTabs(raw);
    expect(tabs).toHaveLength(30);
    expect(tabs[0]!.title).toHaveLength(200);
  });

  it("falls back to the URL when the title is empty", () => {
    expect(sanitizeTabs([{ url: "https://x.com/a", title: "" }])[0]!.title).toBe("https://x.com/a");
  });
});

function sp(createdAt: number, overrides: Partial<ISavePoint> = {}): ISavePoint {
  return { id: `sp${createdAt}`, createdAt, trigger: "switch", nextStep: null, tabs: [], tabsSource: "none", ...overrides };
}

describe("buildSavePoint", () => {
  it("trims the next step, nulls empties, and marks tabsSource none without tabs", () => {
    const s = buildSavePoint({ trigger: "manual", nextStep: "   ", tabsSource: "window" }, 5, "id");
    expect(s).toEqual({ id: "id", createdAt: 5, trigger: "manual", nextStep: null, tabs: [], tabsSource: "none" });
  });

  it("clamps the next step to 280 chars", () => {
    expect(buildSavePoint({ trigger: "manual", nextStep: "x".repeat(400) }, 1, "i").nextStep).toHaveLength(280);
  });
});

describe("save point helpers", () => {
  it("pushCapped keeps newest first", () => {
    expect(pushCapped([2, 1], 3, 2)).toEqual([3, 2]);
  });

  it("latestTabs and latestNextStep look past empty newer entries", () => {
    const tab = { url: "https://x.com", title: "x", kind: "page" as const, vendor: null };
    const list = [sp(3), sp(2, { tabs: [tab], nextStep: "write test" }), sp(1, { nextStep: "old" })];
    expect(latestTabs(list)).toEqual([tab]);
    expect(latestNextStep(list)).toBe("write test");
    expect(latestTabs([])).toEqual([]);
  });
});

describe("shouldShowResume", () => {
  const MIN = 60_000;
  it("is false with no save point", () => {
    expect(shouldShowResume({ latest: null, lastResumeShownAt: null, now: 0 })).toBe(false);
  });
  it("is false for a fresh task switch (< 5 min)", () => {
    expect(shouldShowResume({ latest: sp(0), lastResumeShownAt: null, now: 4 * MIN })).toBe(false);
  });
  it("is true after 5 min away", () => {
    expect(shouldShowResume({ latest: sp(0), lastResumeShownAt: null, now: 5 * MIN })).toBe(true);
  });
  it("is true immediately for idle and stop saves", () => {
    expect(shouldShowResume({ latest: sp(0, { trigger: "idle" }), lastResumeShownAt: null, now: 1 })).toBe(true);
  });
  it("is false once dismissed after that save point", () => {
    expect(shouldShowResume({ latest: sp(10, { trigger: "idle" }), lastResumeShownAt: 10, now: 99 * MIN })).toBe(false);
  });
});

describe("formatAgo", () => {
  it("formats ranges", () => {
    expect(formatAgo(10_000)).toBe("just now");
    expect(formatAgo(5 * 60_000)).toBe("5 min ago");
    expect(formatAgo(125 * 60_000)).toBe("2 h 5 min ago");
    expect(formatAgo(26 * 3_600_000)).toBe("yesterday");
    expect(formatAgo(72 * 3_600_000)).toBe("3 days ago");
  });
});
