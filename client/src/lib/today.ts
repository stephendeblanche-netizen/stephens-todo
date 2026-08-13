export type TodayTask = {
  id: number;
  categoryId: number;
  dueAt: number | null;
  done: boolean;
  sortOrder: number;
};

export type TodayCategory = {
  id: number;
  kind: "urgent" | "normal";
  sortOrder: number;
};

export function toLocalDateInputValue(dueAt: number | null | undefined): string {
  if (!dueAt) return "";
  const date = new Date(dueAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dueAtFromLocalDateInput(value: string): number | null {
  if (!value) return null;
  // Noon avoids date shifts around local daylight-saving boundaries.
  return new Date(`${value}T12:00:00`).getTime();
}

export function isDueToday(dueAt: number | null | undefined, referenceDate = new Date()): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return due.getFullYear() === referenceDate.getFullYear()
    && due.getMonth() === referenceDate.getMonth()
    && due.getDate() === referenceDate.getDate();
}

export function selectTodayTasks<T extends TodayTask>(
  tasks: T[],
  categories: TodayCategory[],
  referenceDate = new Date(),
): T[] {
  const urgentCategoryIds = new Set(categories.filter((category) => category.kind === "urgent").map((category) => category.id));
  const categoryOrder = new Map(categories.map((category) => [category.id, category.sortOrder]));

  return tasks
    .filter((task) => !task.done && (urgentCategoryIds.has(task.categoryId) || isDueToday(task.dueAt, referenceDate)))
    .sort((a, b) => {
      const aUrgent = urgentCategoryIds.has(a.categoryId);
      const bUrgent = urgentCategoryIds.has(b.categoryId);
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
      const categoryDifference = (categoryOrder.get(a.categoryId) ?? 0) - (categoryOrder.get(b.categoryId) ?? 0);
      return categoryDifference || a.sortOrder - b.sortOrder;
    });
}
