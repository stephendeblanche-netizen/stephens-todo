import { describe, expect, it } from "vitest";
import { getKeyboardTaskDestination } from "./taskMovement";

const tasks = [
  { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
  { id: 2, categoryId: 10, parentId: null, sortOrder: 1 },
  { id: 3, categoryId: 10, parentId: null, sortOrder: 2 },
  { id: 4, categoryId: 10, parentId: 2, sortOrder: 0 },
];

describe("getKeyboardTaskDestination", () => {
  it("resolves sibling moves without leaving the current hierarchy level", () => {
    expect(getKeyboardTaskDestination(tasks, 2, "up")).toEqual({ categoryId: 10, parentId: null, index: 0 });
    expect(getKeyboardTaskDestination(tasks, 2, "down")).toEqual({ categoryId: 10, parentId: null, index: 3 });
    expect(getKeyboardTaskDestination(tasks, 1, "up")).toBeNull();
    expect(getKeyboardTaskDestination(tasks, 3, "down")).toBeNull();
  });

  it("resolves indent and outdent destinations at the adjacent hierarchy levels", () => {
    expect(getKeyboardTaskDestination(tasks, 3, "indent")).toEqual({ categoryId: 10, parentId: 2, index: 1 });
    expect(getKeyboardTaskDestination(tasks, 4, "outdent")).toEqual({ categoryId: 10, parentId: null, index: 2 });
    expect(getKeyboardTaskDestination(tasks, 1, "outdent")).toBeNull();
  });
});
