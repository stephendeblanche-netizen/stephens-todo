import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTaskRemote, getDashboard, patchTask } from "./api";
import type { DashboardPayload, QueuedTaskMutation, Task, TaskCreateInput, TaskPatch } from "./types";

const DASHBOARD_CACHE_KEY = "stephens-todo.dashboard.v1";
const MUTATION_QUEUE_KEY = "stephens-todo.mutations.v1";

const mutationId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function applyTaskPatch(dashboard: DashboardPayload, taskId: number, patch: TaskPatch): DashboardPayload {
  return { ...dashboard, syncedAt: Date.now(), tasks: dashboard.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) };
}

export function addTemporaryTask(dashboard: DashboardPayload, input: TaskCreateInput): DashboardPayload {
  const temporaryTask: Task = {
    id: -Date.now(),
    categoryId: input.categoryId,
    parentId: input.parentId ?? null,
    text: input.text,
    note: "",
    done: false,
    sortOrder: input.sortOrder,
    dueAt: null,
    priority: input.priority,
    recurrence: "none",
    accountableDirectReportId: null,
  };
  return { ...dashboard, syncedAt: Date.now(), tasks: [...dashboard.tasks, temporaryTask] };
}

export async function loadCachedDashboard() {
  const raw = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY);
  return raw ? JSON.parse(raw) as DashboardPayload : null;
}

export async function cacheDashboard(dashboard: DashboardPayload) {
  await AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(dashboard));
}

export async function loadMutationQueue() {
  const raw = await AsyncStorage.getItem(MUTATION_QUEUE_KEY);
  return raw ? JSON.parse(raw) as QueuedTaskMutation[] : [];
}

type QueuedMutationInput =
  | { type: "patch"; taskId: number; patch: TaskPatch }
  | { type: "create"; temporaryTaskId: number; input: TaskCreateInput };

export async function enqueueMutation(mutation: QueuedMutationInput) {
  const queue = await loadMutationQueue();
  const entry = { ...mutation, id: mutationId(), createdAt: Date.now() } as QueuedTaskMutation;
  await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify([...queue, entry]));
  return entry;
}

export async function queueLength() {
  return (await loadMutationQueue()).length;
}

export async function flushQueuedMutations() {
  let remaining = await loadMutationQueue();
  if (remaining.length === 0) return null;
  while (remaining.length > 0) {
      const mutation = remaining[0];
      try {
      if (mutation.type === "patch") {
        if (mutation.taskId < 0) throw new Error("A queued task edit is waiting for its task creation to synchronize.");
        // Patches are sparse: a queued local value wins only for fields it changes, while
        // the fresh dashboard fetch below remains authoritative for all other server fields.
        await patchTask(mutation.taskId, mutation.patch);
      } else {
        const created = await createTaskRemote(mutation.input);
        // Persist the real server ID into every later queued edit before continuing.
        remaining = remaining.map((entry, index) => index > 0 && entry.type === "patch" && entry.taskId === mutation.temporaryTaskId
          ? { ...entry, taskId: created.id }
          : entry);
      }
      remaining = remaining.slice(1);
      if (remaining.length === 0) await AsyncStorage.removeItem(MUTATION_QUEUE_KEY);
      else await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(remaining));
    } catch (error) {
      await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(remaining));
      throw error;
    }
  }
  const fresh = await getDashboard();
  await cacheDashboard(fresh);
  return fresh;
}
