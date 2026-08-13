export type DueRange = "all" | "today" | "this_week" | "next_7_days" | "overdue" | "no_due_date";

export type SavedFilterCriteria = {
  priority: "all" | "high" | "medium" | "low";
  dueRange: DueRange;
  categoryId: number | null;
  includeCompleted: boolean;
};

export type FilterableTask = {
  id: number;
  categoryId: number;
  dueAt: number | null;
  priority: "high" | "medium" | "low";
  done: boolean;
};

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function matchesDueRange(dueAt: number | null, range: DueRange, referenceDate = new Date()): boolean {
  if (range === "all") return true;
  if (range === "no_due_date") return dueAt === null;
  if (dueAt === null) return false;

  const dayStart = startOfDay(referenceDate).getTime();
  if (range === "today") return dueAt >= dayStart && dueAt < dayStart + 86_400_000;
  if (range === "overdue") return dueAt < dayStart;
  if (range === "next_7_days") return dueAt >= dayStart && dueAt < dayStart + 7 * 86_400_000;

  // Monday 00:00 through the following Monday 00:00, using local calendar time.
  const weekStart = startOfDay(referenceDate);
  const mondayOffset = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  return dueAt >= weekStart.getTime() && dueAt < nextWeekStart.getTime();
}

export function applySavedFilter<T extends FilterableTask>(
  tasks: T[],
  criteria: SavedFilterCriteria,
  referenceDate = new Date(),
): T[] {
  return tasks.filter((task) => (
    (criteria.includeCompleted || !task.done)
    && (criteria.priority === "all" || task.priority === criteria.priority)
    && (criteria.categoryId === null || task.categoryId === criteria.categoryId)
    && matchesDueRange(task.dueAt, criteria.dueRange, referenceDate)
  ));
}
