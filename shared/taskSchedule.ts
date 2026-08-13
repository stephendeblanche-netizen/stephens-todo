export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly";

function addRecurrenceInterval(date: Date, recurrence: Exclude<TaskRecurrence, "none">) {
  if (recurrence === "daily") {
    date.setUTCDate(date.getUTCDate() + 1);
    return;
  }
  if (recurrence === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
    return;
  }

  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
}

/**
 * Advance a recurrence past the completion moment. Missed instances are skipped
 * rather than recreated one-by-one, so completing an old weekly task produces
 * a practical next occurrence.
 */
export function nextRecurringDueAt(
  dueAt: number | null | undefined,
  recurrence: TaskRecurrence,
  completedAt = Date.now(),
): number | null {
  if (recurrence === "none") return dueAt ?? null;
  const next = new Date(dueAt ?? completedAt);

  do {
    addRecurrenceInterval(next, recurrence);
  } while (next.getTime() <= completedAt);

  return next.getTime();
}
