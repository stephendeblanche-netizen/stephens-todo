import type { ReorderableTask, TaskPlacementUpdate } from "./taskDrop";

function sortTasks(left: ReorderableTask, right: ReorderableTask) {
  return left.categoryId - right.categoryId
    || (left.parentId ?? -1) - (right.parentId ?? -1)
    || left.sortOrder - right.sortOrder
    || left.id - right.id;
}

function hasSelectedAncestor(tasks: ReorderableTask[], task: ReorderableTask, selectedIds: ReadonlySet<number>) {
  let parentId = task.parentId ?? null;
  const visited = new Set<number>();
  while (parentId !== null && !visited.has(parentId)) {
    if (selectedIds.has(parentId)) return true;
    visited.add(parentId);
    parentId = tasks.find((candidate) => candidate.id === parentId)?.parentId ?? null;
  }
  return false;
}

export function selectedTaskRoots(tasks: ReorderableTask[], selectedIds: ReadonlySet<number>) {
  return tasks
    .filter((task) => selectedIds.has(task.id) && !hasSelectedAncestor(tasks, task, selectedIds))
    .sort(sortTasks);
}

export function buildBulkCategoryMoveUpdates(
  tasks: ReorderableTask[],
  selectedIds: ReadonlySet<number>,
  categoryId: number,
): TaskPlacementUpdate[] {
  const selected = selectedTaskRoots(tasks, selectedIds);
  if (selected.length === 0) return [];

  const selectedIdSet = new Set(selected.map((task) => task.id));
  const destinationTasks = tasks
    .filter((task) => task.categoryId === categoryId && (task.parentId ?? null) === null && !selectedIdSet.has(task.id))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return [...destinationTasks, ...selected].map((task, sortOrder) => ({
    id: task.id,
    categoryId,
    parentId: null,
    sortOrder,
  }));
}

/**
 * Moves each contiguous selected sibling group under the item immediately before it.
 * A mixed or first-in-list group is rejected rather than producing an ambiguous indent.
 */
export function buildBulkIndentUpdates(
  tasks: ReorderableTask[],
  selectedIds: ReadonlySet<number>,
): TaskPlacementUpdate[] | null {
  const selected = selectedTaskRoots(tasks, selectedIds);
  if (selected.length === 0) return null;

  const groups = new Map<string, ReorderableTask[]>();
  for (const task of selected) {
    const key = `${task.categoryId}:${task.parentId ?? "root"}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  const updates: TaskPlacementUpdate[] = [];
  for (const group of Array.from(groups.values())) {
    const first = group[0];
    const siblings = tasks
      .filter((task) => task.categoryId === first.categoryId && (task.parentId ?? null) === (first.parentId ?? null))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const indexes = group.map((task) => siblings.findIndex((candidate) => candidate.id === task.id));
    const firstIndex = indexes[0];
    if (firstIndex <= 0 || indexes.some((index, offset) => index !== firstIndex + offset)) return null;

    const parent = siblings[firstIndex - 1];
    const existingChildren = tasks
      .filter((task) => task.categoryId === parent.categoryId && (task.parentId ?? null) === parent.id)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    updates.push(...[...existingChildren, ...group].map((task, sortOrder) => ({
      id: task.id,
      categoryId: parent.categoryId,
      parentId: parent.id,
      sortOrder,
    })));
  }

  return updates;
}
