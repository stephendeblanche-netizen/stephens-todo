import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  getActiveMobilePushDevices,
  getAllCategories,
  getAllTasks,
  getMobileReminderScheduleByTaskUid,
  updateMobileReminderSchedule,
} from "./db";

export type ReminderKind = "urgent" | "due";

type ReminderTask = { id: number; text: string; done: boolean; dueAt: number | null; categoryId: number };
type ReminderCategory = { id: number; kind: "urgent" | "normal" };

function sastDateKey(value: number | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function selectReminderTasks(kind: ReminderKind, tasks: ReminderTask[], categories: ReminderCategory[], now = new Date()) {
  const today = sastDateKey(now);
  if (kind === "due") {
    return tasks.filter((task) => !task.done && task.dueAt !== null && sastDateKey(task.dueAt) === today);
  }
  const urgentCategoryIds = new Set(categories.filter((category) => category.kind === "urgent").map((category) => category.id));
  return tasks.filter((task) => !task.done && urgentCategoryIds.has(task.categoryId));
}

function notificationCopy(kind: ReminderKind, tasks: ReminderTask[]) {
  const firstTasks = tasks.slice(0, 3).map((task) => task.text).join(" • ");
  const label = kind === "urgent" ? "urgent" : "due today";
  return {
    title: `Stephen’s To-Do: ${tasks.length} ${label} task${tasks.length === 1 ? "" : "s"}`,
    body: firstTasks || "Open the app to review your tasks.",
  };
}

export function buildMobilePushTestMessages(tokens: string[]) {
  return tokens.map((to) => ({
    to,
    sound: "default",
    title: "Stephen’s To-Do test",
    body: "Push reminders are connected.",
    data: { type: "task-reminder-test" },
  }));
}

export async function deliverMobilePushTest() {
  const devices = await getActiveMobilePushDevices();
  if (devices.length === 0) return { sent: 0, skipped: "no-registered-devices" as const };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(buildMobilePushTestMessages(devices.map((device) => device.expoPushToken))),
  });
  if (!response.ok) throw new Error(`Expo push service failed with ${response.status}`);
  const receipt = await response.json().catch(() => null);
  return { sent: devices.length, receipt };
}

export async function deliverMobileReminder(kind: ReminderKind, now = new Date()) {
  const [tasks, categories] = await Promise.all([getAllTasks(), getAllCategories()]);
  const reminderTasks = selectReminderTasks(kind, tasks, categories, now);
  const devices = await getActiveMobilePushDevices();
  if (reminderTasks.length === 0) return { sent: 0, skipped: "no-matching-tasks" as const };
  if (devices.length === 0) return { sent: 0, skipped: "no-registered-devices" as const };

  const copy = notificationCopy(kind, reminderTasks);
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(devices.map((device) => ({
      to: device.expoPushToken,
      sound: "default",
      title: copy.title,
      body: copy.body,
      data: { type: "task-reminder", kind, taskIds: reminderTasks.map((task) => task.id) },
    }))),
  });
  if (!response.ok) throw new Error(`Expo push service failed with ${response.status}`);
  return { sent: devices.length, tasks: reminderTasks.length };
}

export function registerMobileReminderRoute(app: Express) {
  app.post("/api/scheduled/mobile-task-reminders", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      taskUid = user.taskUid;
      const match = await getMobileReminderScheduleByTaskUid(taskUid);
      if (!match || !match.schedule.enabled) return res.json({ ok: true, skipped: "disabled-or-orphan" });
      const date = sastDateKey(new Date());
      const alreadyDelivered = match.kind === "urgent"
        ? match.schedule.lastUrgentDeliveryDate === date
        : match.schedule.lastDueDeliveryDate === date;
      if (alreadyDelivered) return res.json({ ok: true, skipped: "already-delivered", date });
      const delivery = await deliverMobileReminder(match.kind);
      await updateMobileReminderSchedule(match.schedule.id, match.kind === "urgent"
        ? { lastUrgentDeliveryDate: date }
        : { lastDueDeliveryDate: date });
      return res.json({ ok: true, kind: match.kind, delivery, date });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Mobile task reminders]", { message, taskUid });
      return res.status(500).json({ error: message, context: { path: req.path, taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
    }
  });
}
