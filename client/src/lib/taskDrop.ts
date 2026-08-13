export type ReorderableTask = {
  id: number;
  categoryId: number;
  parentId: number | null;
  sortOrder: number;
};

export type TaskDropDestination = {
  categoryId: number;
  parentId: number | null;
  index: number;
};

export type TaskPlacementUpdate = {
  id: number;
  categoryId: number;
  parentId: number | null;
  sortOrder: number;
};

export type DragActivator = "pointer" | "touch";

export function getDragActivator(eventType: string | undefined): DragActivator {
  return eventType?.startsWith("touch") ? "touch" : "pointer";
}

export function buildSensorTaskPlacementUpdates(
  _activator: DragActivator,
  tasks: ReorderableTask[],
  activeId: number,
  destination: TaskDropDestination,
) {
  // dnd-kit’s PointerSensor and TouchSensor both resolve to this same durable destination contract.
  return buildTaskPlacementUpdates(tasks, activeId, destination);
}

function isDescendantOf(tasks: ReorderableTask[], candidateId: number, ancestorId: number) {
  let cursor = tasks.find((task) => task.id === candidateId)?.parentId ?? null;
  const visited = new Set<number>();
  while (cursor !== null && !visited.has(cursor)) {
    if (cursor === ancestorId) return true;
    visited.add(cursor);
    cursor = tasks.find((task) => task.id === cursor)?.parentId ?? null;
  }
  return false;
}

/**
 * Creates the exact destination sibling ordering for a task dropped at a visible gap.
 * The server normalises source siblings and cascades category changes to descendants.
 */
export function buildTaskPlacementUpdates(
  tasks: ReorderableTask[],
  activeId: number,
  destination: TaskDropDestination,
): TaskPlacementUpdate[] | null {
  const activeTask = tasks.find((task) => task.id === activeId);
  if (!activeTask) return null;

  if (destination.parentId !== null) {
    const parent = tasks.find((task) => task.id === destination.parentId);
    if (!parent || parent.categoryId !== destination.categoryId || parent.id === activeId) return null;
    if (isDescendantOf(tasks, destination.parentId, activeId)) return null;
  }

  const sameDestination = activeTask.categoryId === destination.categoryId
    && (activeTask.parentId ?? null) === destination.parentId;
  const sourcePosition = tasks
    .filter((task) => task.categoryId === activeTask.categoryId && (task.parentId ?? null) === (activeTask.parentId ?? null))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .findIndex((task) => task.id === activeId);

  const destinationSiblings = tasks
    .filter((task) => task.categoryId === destination.categoryId && (task.parentId ?? null) === destination.parentId && task.id !== activeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let insertionIndex = Math.max(0, Math.min(destination.index, destinationSiblings.length + (sameDestination ? 1 : 0)));
  if (sameDestination && sourcePosition !== -1 && sourcePosition < insertionIndex) insertionIndex -= 1;
  insertionIndex = Math.max(0, Math.min(insertionIndex, destinationSiblings.length));

  destinationSiblings.splice(insertionIndex, 0, {
    ...activeTask,
    categoryId: destination.categoryId,
    parentId: destination.parentId,
  });

  return destinationSiblings.map((task, sortOrder) => ({
    id: task.id,
    categoryId: destination.categoryId,
    parentId: destination.parentId,
    sortOrder,
  }));
}
