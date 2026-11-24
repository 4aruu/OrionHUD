import { expect, it } from "vitest";
import { countLabel } from "../src/sidepanel/lib/format";

it("counts read naturally: 1 decision, 2 decisions, 0 tabs", () => {
  expect(countLabel(1, "decision")).toBe("1 decision");
  expect(countLabel(2, "decision")).toBe("2 decisions");
  expect(countLabel(0, "tab")).toBe("0 tabs");
  expect(countLabel(1, "tab")).toBe("1 tab");
});
