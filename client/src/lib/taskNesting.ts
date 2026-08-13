type ParentLinkedTask = {
  id: number;
  parentId: number | null;
};

export type NestableTask = ParentLinkedTask & {
  categoryId: number;
  sortOrder: number;
};

export type TaskNestUpdate = {
  id: number;
  sortOrder: number;
  parentId: number;
  categoryId: number;
};

/** A task may nest below another task unless it targets itself or one of its descendants. */
export function canNestTask(
  tasks: ParentLinkedTask[],
  taskId: number,
  targetParentId: number,
): boolean {
  if (taskId === targetParentId) return false;
  let cursor = tasks.find((task) => task.id === targetParentId) ?? null;
  while (cursor) {
    if (cursor.id === taskId) return false;
    cursor = cursor.parentId === null ? null : tasks.find((task) => task.id === cursor?.parentId) ?? null;
  }
  return true;
}

/** Build the persisted reorder payload for dropping a task beneath another task. */
export function buildTaskNestUpdates(
  tasks: NestableTask[],
  taskId: number,
  targetParentId: number,
): TaskNestUpdate[] | null {
  const activeTask = tasks.find((task) => task.id === taskId);
  const parentTask = tasks.find((task) => task.id === targetParentId);
  if (!activeTask || !parentTask || !canNestTask(tasks, taskId, targetParentId)) return null;

  const destinationSiblings = tasks
    .filter((task) => task.categoryId === parentTask.categoryId && task.parentId === parentTask.id && task.id !== activeTask.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return [...destinationSiblings, activeTask].map((task, sortOrder) => ({
    id: task.id,
    sortOrder,
    parentId: parentTask.id,
    categoryId: parentTask.categoryId,
  }));
}
