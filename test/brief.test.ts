import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/shared/brief";
import type { IMicroNote } from "../src/shared/types";
import { makeTask, makeWorkflow } from "./fixtures";

const note = (id: string, content: string, kind: "note" | "decision", t: number): IMicroNote => ({
  id, content, kind, timestamp: t, isActionableCommand: false, sourceUrl: null,
});

function fixture() {
  const leaf = makeTask("retry", [makeTask("mock401"), makeTask("assert", [], { status: "DONE" })], {
    title: "Write retry test",
    microNotes: [
      note("d1", "Use exponential backoff", "decision", 1),
      note("d2", "Max 3 retries", "decision", 2),
      note("n1", "flaky on CI\n# not a heading", "note", 3),
    ],
    savePoints: [
      {
        id: "s1", createdAt: 10, trigger: "switch", nextStep: "mock 401 then assert single refresh",
        tabsSource: "window",
        tabs: [
          { url: "https://claude.ai/chat/1", title: "Token [refresh] design", kind: "ai-thread", vendor: "Claude" },
          { url: "https://github.com/o/r/pull/7", title: "PR 7", kind: "page", vendor: null },
        ],
      },
    ],
  });
  const token = makeTask("token", [leaf], { title: "Token refresh", isMilestone: true });
  const auth = makeTask("auth", [token], { title: "Auth refactor" });
  return makeWorkflow([auth, makeTask("docs", [], { status: "DONE" })], { name: "Payments API" });
}

describe("buildBrief", () => {
  const brief = buildBrief(fixture(), "retry");

  it("leads with the breadcrumb, milestone, progress, and next step", () => {
    expect(brief).toContain("# Context: Payments API");
    expect(brief).toContain("**Current task:** Auth refactor › Token refresh › Write retry test");
    expect(brief).toContain("**Milestone:** Token refresh");
    expect(brief).toContain("**Progress:** 2/3 overall, 1/2 in this task");
    expect(brief).toContain("**Next step:** mock 401 then assert single refresh");
  });

  it("lists decisions newest first", () => {
    expect(brief.indexOf("Max 3 retries")).toBeLessThan(brief.indexOf("Use exponential backoff"));
  });

  it("lists only open subtasks", () => {
    expect(brief).toContain("- [ ] mock401");
    expect(brief).not.toContain("- [ ] assert");
  });

  it("flattens newlines in user text so it can't inject headings", () => {
    expect(brief).toContain("- flaky on CI # not a heading");
    expect(brief).not.toMatch(/^# not a heading/m);
  });

  it("labels AI threads and strips brackets from link text", () => {
    expect(brief).toContain("- [Claude thread: Token refresh design](https://claude.ai/chat/1)");
    expect(brief).toContain("- [PR 7](https://github.com/o/r/pull/7)");
  });

  it("handles a missing task", () => {
    expect(buildBrief(fixture(), "nope")).toContain("(Task not found.)");
  });
});
