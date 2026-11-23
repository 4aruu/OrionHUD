import { describe, expect, it } from "vitest";
import { countOutline, outlineHeight, parseOutline, type OutlineItem } from "../src/shared/outline";

function shape(items: OutlineItem[]): string {
  return items.map((i) => (i.children.length ? `${i.title}(${shape(i.children)})` : i.title)).join(",");
}

describe("parseOutline", () => {
  it("nests by relative indentation", () => {
    const text = "Auth\n  Token refresh\n    Retry test\n  Logout\nDocs";
    expect(shape(parseOutline(text))).toBe("Auth(Token refresh(Retry test),Logout),Docs");
  });

  it("strips markdown bullets, checkboxes, numbers, and tabs", () => {
    const text = "- [ ] Setup\n\t- [x] Install deps\n\t* Configure\n1. Ship\n2) Announce";
    expect(shape(parseOutline(text))).toBe("Setup(Install deps,Configure),Ship,Announce");
  });

  it("headings start new top-level items", () => {
    const text = "## Phase 1\n- a\n- b\n## Phase 2\n- c";
    expect(shape(parseOutline(text))).toBe("Phase 1(a,b),Phase 2(c)");
  });

  it("skips blank lines and caps depth", () => {
    const text = "a\n\n  b\n    c\n      d";
    expect(outlineHeight(parseOutline(text, 2))).toBe(2);
    expect(countOutline(parseOutline(text, 2))).toBe(4);
  });

  it("clamps long titles", () => {
    expect(parseOutline("x".repeat(500))[0]!.title).toHaveLength(200);
  });
});
