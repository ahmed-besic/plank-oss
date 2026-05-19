import { describe, expect, it } from "vitest";
import {
  compareOrderKeys,
  createKeyAfter,
  createKeyBefore,
  createKeyBetween,
  normalizeOrderBounds,
} from "./order";

describe("order helpers", () => {
  it("creates a key between neighbors", () => {
    const first = createKeyAfter(null);
    const second = createKeyAfter(first);
    const between = createKeyBetween(first, second);

    expect(first < between).toBe(true);
    expect(between < second).toBe(true);
  });

  it("creates a key before an existing item", () => {
    const target = createKeyAfter(null);
    const before = createKeyBefore(target);

    expect(before < target).toBe(true);
  });

  it("compares keys using raw string ordering", () => {
    expect(compareOrderKeys("Zz", "a0")).toBeLessThan(0);
    expect(compareOrderKeys("a0", "Zz")).toBeGreaterThan(0);
  });

  it("normalizes reversed bounds before generating a key", () => {
    expect(normalizeOrderBounds("a0", "Zz")).toEqual({
      previous: "Zz",
      next: "a0",
    });
  });
});
