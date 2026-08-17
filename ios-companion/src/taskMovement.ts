import type { Task } from "./types";

export type TaskMoveDestination = { categoryId: number; parentId: number | null };
export type TaskReorderUpdate = { id: number; categoryId: number; parentId: number | null; sortOrder: number };

const sameGroup = (task: Task, destination: TaskMoveDestination) => task.categoryId === destination.categoryId && (task.parentId ?? null) === destination.parentId;
const siblingsFor = (tasks: Task[], destination: TaskMoveDestination, excludingId?: number) => tasks
  .filter((task) => task.id !== excludingId && task.categoryId === destination.categoryId && (task.parentId ?? null) === destination.parentId)
  .sort((left, right) => left.sortOrder - right.sortOrder);

export function getDescendantTaskIds(tasks: Task[], taskId: number): Set<number> {
  const descendants = new Set<number>();
  const visit = (parentId: number) => {
    tasks.filter((task) => task.parentId === parentId).forEach((child) => {
      descendants.add(child.id);
      visit(child.id);
    });
  };
  visit(taskId);
  return descendants;
}

export function isValidMoveParent(tasks: Task[], taskId: number, candidateParentId: number | null): boolean {
  if (candidateParentId === null) return true;
  if (candidateParentId === taskId) return false;
  return !getDescendantTaskIds(tasks, taskId).has(candidateParentId);
}

export function buildTaskMoveUpdates(tasks: Task[], taskId: number, destination: TaskMoveDestination): TaskReorderUpdate[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving || !isValidMoveParent(tasks, taskId, destination.parentId)) return [];
  const original: TaskMoveDestination = { categoryId: moving.categoryId, parentId: moving.parentId ?? null };
  if (sameGroup(moving, destination)) {
    return [...siblingsFor(tasks, original, taskId), moving].map((task, sortOrder) => ({ id: task.id, categoryId: original.categoryId, parentId: original.parentId, sortOrder }));
  }
  const source = siblingsFor(tasks, original, taskId).map((task, sortOrder) => ({ id: task.id, categoryId: original.categoryId, parentId: original.parentId, sortOrder }));
  const target = [...siblingsFor(tasks, destination, taskId), moving].map((task, sortOrder) => ({ id: task.id, categoryId: destination.categoryId, parentId: destination.parentId, sortOrder }));
  return [...source, ...target];
}

export function buildTaskReorderUpdates(tasks: Task[], categoryId: number): TaskReorderUpdate[] {
  return tasks
    .filter((task) => task.categoryId === categoryId && task.parentId === null)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((task, sortOrder) => ({ id: task.id, categoryId, parentId: null, sortOrder }));
}

const groupKey = (destination: TaskMoveDestination) => `${destination.categoryId}:${destination.parentId ?? "root"}`;

export function buildBulkTaskMoveUpdates(tasks: Task[], selectedIds: number[], destination: TaskMoveDestination): TaskReorderUpdate[] {
  const selected = new Set(selectedIds);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const roots = selectedIds
    .map((id) => taskById.get(id))
    .filter((task): task is Task => Boolean(task))
    .filter((task) => {
      let parentId = task.parentId;
      while (parentId !== null) {
        if (selected.has(parentId)) return false;
        parentId = taskById.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  if (!roots.length || (destination.parentId !== null && (selected.has(destination.parentId) || roots.some((task) => !isValidMoveParent(tasks, task.id, destination.parentId))))) return [];

  const destinationKey = groupKey(destination);
  const sourceGroups = new Map<string, TaskMoveDestination>();
  roots.forEach((task) => {
    const origin = { categoryId: task.categoryId, parentId: task.parentId ?? null };
    if (groupKey(origin) !== destinationKey) sourceGroups.set(groupKey(origin), origin);
  });
  const sourceUpdates = [...sourceGroups.values()].flatMap((origin) =>
    siblingsFor(tasks, origin).filter((task) => !selected.has(task.id)).map((task, sortOrder) => ({ id: task.id, categoryId: origin.categoryId, parentId: origin.parentId, sortOrder })),
  );
  const target = [...siblingsFor(tasks, destination).filter((task) => !selected.has(task.id)), ...roots];
  const targetUpdates = target.map((task, sortOrder) => ({ id: task.id, categoryId: destination.categoryId, parentId: destination.parentId, sortOrder }));
  return [...sourceUpdates, ...targetUpdates];
}
