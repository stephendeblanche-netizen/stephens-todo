import type { ReorderableTask, TaskDropDestination } from "./taskDrop";

export type TaskMovementDirection = "up" | "down" | "indent" | "outdent";

function getSiblings(tasks: ReorderableTask[], categoryId: number, parentId: number | null) {
  return tasks
    .filter((task) => task.categoryId === categoryId && (task.parentId ?? null) === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * Resolves a keyboard movement into the same durable sibling-gap destination
 * used by drag-and-drop and the Move to menu.
 */
export function getKeyboardTaskDestination(
  tasks: ReorderableTask[],
  taskId: number,
  direction: TaskMovementDirection,
): TaskDropDestination | null {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;

  const parentId = task.parentId ?? null;
  const siblings = getSiblings(tasks, task.categoryId, parentId);
  const index = siblings.findIndex((candidate) => candidate.id === taskId);
  if (index === -1) return null;

  if (direction === "up") {
    if (index === 0) return null;
    return { categoryId: task.categoryId, parentId, index: index - 1 };
  }

  if (direction === "down") {
    if (index === siblings.length - 1) return null;
    // Placement indices include the moving task, so moving down skips the next sibling.
    return { categoryId: task.categoryId, parentId, index: index + 2 };
  }

  if (direction === "indent") {
    const previousSibling = siblings[index - 1];
    if (!previousSibling) return null;
    return {
      categoryId: previousSibling.categoryId,
      parentId: previousSibling.id,
      index: getSiblings(tasks, previousSibling.categoryId, previousSibling.id).length,
    };
  }

  if (parentId === null) return null;
  const parent = tasks.find((candidate) => candidate.id === parentId);
  if (!parent) return null;
  const parentSiblings = getSiblings(tasks, parent.categoryId, parent.parentId ?? null);
  const parentIndex = parentSiblings.findIndex((candidate) => candidate.id === parent.id);
  if (parentIndex === -1) return null;

  return {
    categoryId: parent.categoryId,
    parentId: parent.parentId ?? null,
    index: parentIndex + 1,
  };
}
