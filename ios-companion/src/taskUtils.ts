import type { Category, Priority, Task } from "./types";

export const priorityColor = (priority: Priority) => priority === "high" ? "#C63E3E" : priority === "medium" ? "#B77716" : "#248A50";
export const taskMatchesPriority = (task: Task, priority: "all" | Priority) => priority === "all" || task.priority === priority;
export const orderTasks = (tasks: Task[], categories: Category[]) => {
  const categoryOrder = new Map(categories.map((category) => [category.id, category.sortOrder]));
  return [...tasks].sort((a, b) => (categoryOrder.get(a.categoryId) ?? 0) - (categoryOrder.get(b.categoryId) ?? 0) || a.sortOrder - b.sortOrder);
};
export const dueText = (dueAt: number | null) => dueAt ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(new Date(dueAt)) : "No due date";
