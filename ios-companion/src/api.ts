import { Platform } from "react-native";
import type { DashboardPayload, Task, TaskCreateInput, TaskPatch } from "./types";

const API = "https://stephtodo-hbslvcim.manus.space";
const PREVIEW_API = "https://3000-iv6cbe04u4bd6491hsmh0-b71c759d.us2.manus.computer";
type TrpcResult<T> = { result: { data: { json: T } } };

async function read<T>(procedure: string): Promise<T> {
  const input = encodeURIComponent(JSON.stringify({ json: null }));
  const response = await fetch(`${API}/api/trpc/${procedure}?input=${input}`);
  if (!response.ok) throw new Error("Could not load the dashboard");
  return (await response.json() as TrpcResult<T>).result.data.json;
}

async function mutate<T>(procedure: string, input: unknown): Promise<T> {
  const response = await fetch(`${API}/api/trpc/${procedure}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: input }),
  });
  if (!response.ok) throw new Error("Could not save the task change");
  return (await response.json() as TrpcResult<T>).result.data.json;
}

export async function getDashboard(): Promise<DashboardPayload> {
  if (Platform.OS === "web") {
    const response = await fetch(`${PREVIEW_API}/api/mobile/dashboard`);
    if (!response.ok) throw new Error("Could not load the local dashboard preview");
    return response.json() as Promise<DashboardPayload>;
  }
  const [categories, tasks, directReports] = await Promise.all([
    read<DashboardPayload["categories"]>("categories.list"),
    read<DashboardPayload["tasks"]>("tasks.listAll"),
    read<DashboardPayload["directReports"]>("directReports.list"),
  ]);
  return { categories, tasks, directReports, syncedAt: Date.now() };
}

export function patchTask(id: number, patch: TaskPatch) {
  return mutate<{ success: true }>("tasks.update", { id, ...patch });
}

export function registerMobileDevice(input: { installationId: string; expoPushToken: string; enabled: boolean }) {
  return mutate<{ success: true }>("mobileReminders.registerDevice", input);
}

export function getReminderSettings() {
  return read<{ enabled: boolean; urgentTimeSast: string; dueTimeSast: string }>("mobileReminders.settings");
}

export function createTaskRemote(input: TaskCreateInput) {
  return mutate<{ id: number }>("tasks.create", input);
}

export function deleteTaskRemote(id: number) {
  return mutate<{ success: true }>("tasks.delete", { id });
}

export function createCategoryRemote(input: { name: string; sortOrder: number; colorIndex: number }) {
  return mutate<{ id: number }>("categories.create", { ...input, kind: "normal" });
}

export function createDirectReportRemote(input: { name: string; sortOrder: number }) {
  return mutate<{ id: number }>("directReports.create", input);
}

export function updateCategoryRemote(input: { id: number; name?: string; colorIndex?: number; sortOrder?: number }) {
  return mutate<{ success: true }>("categories.update", input);
}

export function deleteCategoryRemote(id: number) {
  return mutate<{ success: true }>("categories.delete", { id });
}

export function reorderCategoriesRemote(items: Array<{ id: number; sortOrder: number }>) {
  return mutate<{ success: true }>("categories.reorder", items);
}

export function updateDirectReportRemote(input: { id: number; name?: string; sortOrder?: number }) {
  return mutate<{ success: true }>("directReports.update", input);
}

export function deleteDirectReportRemote(id: number) {
  return mutate<{ success: true }>("directReports.delete", { id });
}

export function reorderTasksRemote(items: Array<{ id: number; sortOrder: number; parentId?: number | null; categoryId?: number }>) {
  return mutate<{ success: true }>("tasks.reorder", items);
}

export async function addTask(categoryId: number, text: string) {
  const tasks = await read<Task[]>("tasks.listAll");
  const sortOrder = tasks.filter((task) => task.categoryId === categoryId && task.parentId === null).length;
  return createTaskRemote({ categoryId, text, sortOrder, priority: "medium" });
}
