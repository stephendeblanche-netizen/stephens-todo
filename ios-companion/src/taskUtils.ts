import type { Category, Priority, Task } from "./types";

export const priorityColor = (priority: Priority) => priority === "high" ? "#C63E3E" : priority === "medium" ? "#B77716" : "#248A50";
export const taskMatchesPriority = (task: Task, priority: "all" | Priority) => priority === "all" || task.priority === priority;
export type OrderedTask = Task & { hierarchyDepth: number; parentTaskText: string | null };

const compareTasks = (left: Task, right: Task) => left.sortOrder - right.sortOrder || left.id - right.id;

/** Orders each category as a depth-first parent → child tree, retaining enough context for a clear nested presentation. */
export const orderTasks = (tasks: Task[], categories: Category[]): OrderedTask[] => {
  const categoryOrder = new Map(categories.map((category) => [category.id, category.sortOrder]));
  const sortedCategories = [...categories].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const tasksByCategory = new Map<number, Task[]>();
  for (const task of tasks) tasksByCategory.set(task.categoryId, [...(tasksByCategory.get(task.categoryId) ?? []), task]);

  const result: OrderedTask[] = [];
  const visited = new Set<number>();
  const appendCategory = (categoryId: number, categoryTasks: Task[]) => {
    const taskById = new Map(categoryTasks.map((task) => [task.id, task]));
    const children = new Map<number, Task[]>();
    for (const task of categoryTasks) {
      if (task.parentId !== null && taskById.has(task.parentId)) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task]);
    }
    for (const siblingList of children.values()) siblingList.sort(compareTasks);
    const appendTask = (task: Task, depth: number, parentTaskText: string | null) => {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      result.push({ ...task, hierarchyDepth: depth, parentTaskText });
      for (const child of children.get(task.id) ?? []) appendTask(child, depth + 1, task.text);
    };
    const roots = categoryTasks.filter((task) => task.parentId === null || !taskById.has(task.parentId)).sort(compareTasks);
    for (const root of roots) appendTask(root, 0, null);
    // Preserve visibility for malformed or cyclic historic records without allowing a recursive loop.
    for (const remaining of [...categoryTasks].sort(compareTasks)) appendTask(remaining, 0, null);
  };

  for (const category of sortedCategories) appendCategory(category.id, tasksByCategory.get(category.id) ?? []);
  for (const [categoryId, categoryTasks] of [...tasksByCategory.entries()].sort(([left], [right]) => (categoryOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left - right)) appendCategory(categoryId, categoryTasks);
  return result;
};
export const dueText = (dueAt: number | null) => dueAt ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(new Date(dueAt)) : "No due date";
