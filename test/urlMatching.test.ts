import { describe, expect, it } from "vitest";
import {
  evaluateDrift,
  hostMatches,
  isUrlBlacklisted,
} from "../src/shared/urlMatching";

describe("hostMatches", () => {
  it("matches exact hostnames", () => {
    expect(hostMatches("slack.com", "slack.com")).toBe(true);
  });

  it("matches subdomains against a bare domain pattern", () => {
    expect(hostMatches("app.slack.com", "slack.com")).toBe(true);
  });

  it("does not match unrelated domains", () => {
    expect(hostMatches("notslack.com", "slack.com")).toBe(false);
  });

  it("ignores www prefix on the pattern", () => {
    expect(hostMatches("slack.com", "www.slack.com")).toBe(true);
  });
});

describe("isUrlBlacklisted", () => {
  it("flags a blacklisted domain", () => {
    expect(
      isUrlBlacklisted("https://app.slack.com/client/x", ["slack.com"])
    ).toBe(true);
  });

  it("does not flag a non-blacklisted domain", () => {
    expect(
      isUrlBlacklisted("https://github.com/x/y", ["slack.com"])
    ).toBe(false);
  });

  it("does not guess when the URL is unresolvable", () => {
    // This is the case that matters: no URL permission for this tab
    // must never be silently treated as "blacklisted".
    expect(isUrlBlacklisted(undefined, ["slack.com"])).toBe(false);
  });
});

describe("evaluateDrift", () => {
  it("is on-target when the task has no configured URL check", () => {
    expect(evaluateDrift("https://anything.com", null)).toBe("on-target");
  });

  it("is unknown, not drifted, when the current URL can't be read", () => {
    // The permission-not-granted case. Collapsing this into "drifted"
    // would nag the user on every tab OrionHUD can't see into,
    // regardless of whether they're actually off-task.
    expect(evaluateDrift(undefined, "https://console.aws.amazon.com")).toBe(
      "unknown"
    );
  });

  it("is on-target when hostnames match, ignoring path and query", () => {
    expect(
      evaluateDrift(
        "https://console.aws.amazon.com/ecs/deploy?x=1",
        "https://console.aws.amazon.com/ecs"
      )
    ).toBe("on-target");
  });

  it("is drifted when hostnames differ", () => {
    expect(
      evaluateDrift("https://slack.com/x", "https://console.aws.amazon.com")
    ).toBe("drifted");
  });
});
