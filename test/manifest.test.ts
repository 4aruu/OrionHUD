import { expect, it } from "vitest";
import manifest from "../manifest.json";
import { APP_NAME } from "../src/shared/brand";

const DESCRIPTION = "Saves your tabs, AI chats and next step whenever you get pulled away, so you pick up exactly where you left off.";

it("manifest carries the brand", () => {
  expect(manifest.name).toBe(APP_NAME);
  expect(manifest.action.default_title).toBe(APP_NAME);
  expect(manifest.description).toBe(DESCRIPTION);
  expect(manifest.description.length).toBeLessThanOrEqual(132);
});
