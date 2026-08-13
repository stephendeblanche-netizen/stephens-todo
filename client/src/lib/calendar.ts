export type CalendarTask = {
  id: number;
  dueAt: number | null;
  done: boolean;
  priority: "high" | "medium" | "low";
};

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarMonthDays(anchorDate: Date): Date[] {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function groupTasksByDay<T extends CalendarTask>(tasks: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const key = dateKey(new Date(task.dueAt));
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return groups;
}

export function filterTasksByPriority<T extends CalendarTask>(
  tasks: T[],
  priority: "all" | T["priority"],
): T[] {
  return priority === "all" ? tasks : tasks.filter((task) => task.priority === priority);
}
