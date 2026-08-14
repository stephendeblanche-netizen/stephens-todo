import { describe, expect, it } from "vitest";
import { buildBulkCategoryMoveUpdates, buildBulkIndentUpdates, selectedTaskRoots } from "./taskSelection";

const tasks = [
  { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
  { id: 2, categoryId: 10, parentId: null, sortOrder: 1 },
  { id: 3, categoryId: 10, parentId: null, sortOrder: 2 },
  { id: 4, categoryId: 10, parentId: 2, sortOrder: 0 },
  { id: 5, categoryId: 20, parentId: null, sortOrder: 0 },
];

describe("task selection helpers", () => {
  it("uses selected roots so a selected parent does not move its child twice", () => {
    expect(selectedTaskRoots(tasks, new Set([2, 4, 3])).map((task) => task.id)).toEqual([2, 3]);
  });

  it("moves selected task roots together to the end of a category", () => {
    expect(buildBulkCategoryMoveUpdates(tasks, new Set([2, 3, 4]), 20)).toEqual([
      { id: 5, categoryId: 20, parentId: null, sortOrder: 0 },
      { id: 2, categoryId: 20, parentId: null, sortOrder: 1 },
      { id: 3, categoryId: 20, parentId: null, sortOrder: 2 },
    ]);
  });

  it("indents one contiguous selected sibling group together", () => {
    expect(buildBulkIndentUpdates(tasks, new Set([2, 3]))).toEqual([
      { id: 2, categoryId: 10, parentId: 1, sortOrder: 0 },
      { id: 3, categoryId: 10, parentId: 1, sortOrder: 1 },
    ]);
    expect(buildBulkIndentUpdates(tasks, new Set([1, 3]))).toBeNull();
  });
});
