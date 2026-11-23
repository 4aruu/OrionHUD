import { describe, expect, it } from "vitest";
import { isOwnSender, parseExtensionMessage } from "../src/shared/messages";

describe("parseExtensionMessage", () => {
  it("accepts valid messages", () => {
    expect(parseExtensionMessage({ type: "ORION_STATE_CHANGED", reason: "idle" })).toEqual({
      type: "ORION_STATE_CHANGED", reason: "idle",
    });
    expect(parseExtensionMessage({ type: "ORION_CAPTURE_SUBMIT", mode: "save", text: "" })).toEqual({
      type: "ORION_CAPTURE_SUBMIT", mode: "save", text: "",
    });
  });

  it.each([
    null,
    "string",
    [],
    { type: "NOPE" },
    { type: "ORION_STATE_CHANGED", reason: "hacked" },
    { type: "ORION_CAPTURE_SUBMIT", mode: "delete", text: "x" },
    { type: "ORION_CAPTURE_SUBMIT", mode: "inbox", text: "   " },
    { type: "ORION_CAPTURE_SUBMIT", mode: "inbox", text: 5 },
    { type: "ORION_CAPTURE_SUBMIT", mode: "inbox", text: "x".repeat(501) },
  ])("rejects %j", (raw) => {
    expect(parseExtensionMessage(raw)).toBeNull();
  });
});

describe("isOwnSender", () => {
  it("only trusts this extension's id", () => {
    expect(isOwnSender({ id: "me" }, "me")).toBe(true);
    expect(isOwnSender({ id: "other" }, "me")).toBe(false);
    expect(isOwnSender({}, "me")).toBe(false);
  });
});
