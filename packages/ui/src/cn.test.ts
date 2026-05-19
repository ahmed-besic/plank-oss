import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges classes and lets later tailwind utilities win", () => {
    expect(cn("px-2 py-1", false && "hidden", "px-4")).toBe("py-1 px-4");
  });

  it("flattens nested conditional values", () => {
    expect(cn(["text-sm", null, ["font-medium"]], { hidden: false, block: true }))
      .toBe("text-sm font-medium block");
  });
});
