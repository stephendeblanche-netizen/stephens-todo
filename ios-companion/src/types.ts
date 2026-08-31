export type Priority = "high" | "medium" | "low";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export type Category = { id: number; name: string; kind: "urgent" | "normal"; colorIndex: number; sortOrder: number };
export type DirectReport = { id: number; name: string; sortOrder: number };
export type Task = {
  id: number; categoryId: number; parentId: number | null; text: string; note: string; done: boolean;
  sortOrder: number; dueAt: number | null; priority: Priority; recurrence: Recurrence; accountableDirectReportId: number | null;
};
export type DashboardPayload = { categories: Category[]; tasks: Task[]; directReports: DirectReport[]; syncedAt: number };
export type TaskPatch = Partial<Pick<Task, "done" | "note" | "priority" | "accountableDirectReportId">>;
export type TaskCreateInput = { categoryId: number; parentId?: number; text: string; sortOrder: number; dueAt?: number | null; priority: Priority; recurrence?: Recurrence; accountableDirectReportId?: number | null; mobileClientMutationId?: string };
export type QueuedTaskMutation =
  | { id: string; type: "patch"; taskId: number; patch: TaskPatch; createdAt: number }
  | { id: string; type: "create"; temporaryTaskId: number; input: TaskCreateInput; createdAt: number };
