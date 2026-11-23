import { describe, it, expect } from "vitest";
import {
  validateDomain,
  validateLabel,
  validateWorkflowName,
  validateTaskTitle,
  validateNoteContent,
  validateGracePeriod,
  LIMITS,
} from "../src/shared/validators";

// ─── validateDomain ────────────────────────────────────────────────────────
describe("validateDomain", () => {
  it("accepts a bare domain", () => {
    expect(validateDomain("reddit.com")).toBe("reddit.com");
  });

  it("accepts a subdomain", () => {
    expect(validateDomain("app.slack.com")).toBe("app.slack.com");
  });

  it("strips http:// prefix", () => {
    expect(validateDomain("https://youtube.com/watch?v=abc")).toBe("youtube.com");
  });

  it("strips www. prefix", () => {
    expect(validateDomain("www.reddit.com")).toBe("reddit.com");
  });

  it("normalises to lowercase", () => {
    expect(validateDomain("Reddit.COM")).toBe("reddit.com");
  });

  it("rejects an empty string", () => {
    expect(validateDomain("")).toBeNull();
  });

  it("rejects plain words with no TLD", () => {
    expect(validateDomain("localhost")).toBeNull();
  });

  it("rejects strings with spaces", () => {
    expect(validateDomain("not a domain")).toBeNull();
  });

  it("rejects path traversal attempts", () => {
    // After stripping the path, this becomes a junk string
    expect(validateDomain("../../etc/passwd")).toBeNull();
  });

  it("rejects a string exceeding 253 chars", () => {
    const long = "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(63) + ".com";
    expect(long.length).toBeGreaterThan(LIMITS.domain);
    expect(validateDomain(long)).toBeNull();
  });

  it("accepts an IP-like pattern that is a valid label (edge case)", () => {
    // "1.2.3.com" passes the regex — intentional, we're not blocking IPs explicitly
    expect(validateDomain("1.2.3.com")).not.toBeNull();
  });
});

// ─── validateLabel ─────────────────────────────────────────────────────────
describe("validateLabel", () => {
  it("trims whitespace and returns the string", () => {
    expect(validateLabel("  hello  ", 120)).toBe("hello");
  });

  it("rejects an empty string after trimming", () => {
    expect(validateLabel("   ", 120)).toBeNull();
  });

  it("rejects a string exceeding maxLen", () => {
    expect(validateLabel("a".repeat(121), 120)).toBeNull();
  });

  it("accepts a string exactly at maxLen", () => {
    expect(validateLabel("a".repeat(120), 120)).toBe("a".repeat(120));
  });
});

// ─── Specific wrappers ─────────────────────────────────────────────────────
describe("validateWorkflowName", () => {
  it("rejects names longer than 120 chars", () => {
    expect(validateWorkflowName("x".repeat(121))).toBeNull();
  });
  it("accepts a normal name", () => {
    expect(validateWorkflowName("Cloud Sprint 1")).toBe("Cloud Sprint 1");
  });
});

describe("validateTaskTitle", () => {
  it("rejects titles longer than 200 chars", () => {
    expect(validateTaskTitle("t".repeat(201))).toBeNull();
  });
});

describe("validateNoteContent", () => {
  it("rejects notes longer than 500 chars", () => {
    expect(validateNoteContent("n".repeat(501))).toBeNull();
  });
  it("accepts actionable commands prefixed with !", () => {
    expect(validateNoteContent("!deploy to staging")).toBe("!deploy to staging");
  });
});

// ─── validateGracePeriod ───────────────────────────────────────────────────
describe("validateGracePeriod", () => {
  it("accepts 0 (instant expiry)", () => {
    expect(validateGracePeriod(0)).toBe(0);
  });
  it("accepts 5", () => {
    expect(validateGracePeriod(5)).toBe(5);
  });
  it("accepts the maximum (1440 = 24 h)", () => {
    expect(validateGracePeriod(1440)).toBe(1440);
  });
  it("rejects negative values", () => {
    expect(validateGracePeriod(-1)).toBeNull();
  });
  it("rejects values above 1440", () => {
    expect(validateGracePeriod(1441)).toBeNull();
  });
  it("rejects NaN", () => {
    expect(validateGracePeriod(NaN)).toBeNull();
  });
  it("rounds fractional values", () => {
    expect(validateGracePeriod(4.9)).toBe(5);
  });
});
