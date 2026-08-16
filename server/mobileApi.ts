import type { Express, Request, Response } from "express";
import { z } from "zod";
import * as db from "./db";

const taskPatchSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  note: z.string().max(10_000).optional(),
  dueAt: z.number().int().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  accountableDirectReportId: z.number().int().nullable().optional(),
  done: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one task field is required");

const createTaskSchema = z.object({
  categoryId: z.number().int().positive(),
  parentId: z.number().int().positive().optional(),
  text: z.string().trim().min(1).max(500),
  dueAt: z.number().int().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  accountableDirectReportId: z.number().int().nullable().optional(),
});

function applyMobileHeaders(response: Response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseTaskId(request: Request): number | null {
  const taskId = Number(request.params.taskId);
  return Number.isInteger(taskId) && taskId > 0 ? taskId : null;
}

/**
 * A deliberately small API contract for the native companion app. The dashboard
 * remains the source of truth; this exposes the same data model and mutations
 * already available to the existing public dashboard UI.
 */
export function registerMobileApi(app: Express) {
  app.options("/api/mobile/*", (_request, response) => {
    applyMobileHeaders(response);
    response.status(204).end();
  });

  app.get("/api/mobile/dashboard", async (_request, response) => {
    applyMobileHeaders(response);
    try {
      const [categories, tasks, directReports] = await Promise.all([
        db.getAllCategories(),
        db.getAllTasks(),
        db.getAllDirectReports(),
      ]);
      response.json({ categories, tasks, directReports, syncedAt: Date.now() });
    } catch (error) {
      console.error("[Mobile API] Failed to load dashboard data", error);
      response.status(500).json({ error: "Unable to load dashboard data" });
    }
  });

  app.patch("/api/mobile/tasks/:taskId", async (request, response) => {
    applyMobileHeaders(response);
    const taskId = parseTaskId(request);
    if (!taskId) {
      response.status(400).json({ error: "Invalid task identifier" });
      return;
    }

    const parsed = taskPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid task update", details: parsed.error.flatten() });
      return;
    }

    try {
      await db.updateTask(taskId, parsed.data);
      response.json({ success: true });
    } catch (error) {
      console.error("[Mobile API] Failed to update task", error);
      response.status(500).json({ error: "Unable to update task" });
    }
  });

  app.post("/api/mobile/tasks", async (request, response) => {
    applyMobileHeaders(response);
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid new task", details: parsed.error.flatten() });
      return;
    }

    try {
      const siblingTasks = await db.getTasksByCategory(parsed.data.categoryId);
      const sortOrder = siblingTasks.filter((task) => (task.parentId ?? null) === (parsed.data.parentId ?? null)).length;
      const id = await db.createTask({ ...parsed.data, sortOrder });
      response.status(201).json({ id });
    } catch (error) {
      console.error("[Mobile API] Failed to create task", error);
      response.status(500).json({ error: "Unable to create task" });
    }
  });
}
