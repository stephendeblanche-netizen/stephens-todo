import type { Express, Response } from "express";
import { getAllCategories, getAllDirectReports, getAllTasks } from "./db";

function setMobileHeaders(response: Response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

/** Read-only development API used by the local native companion preview. */
export function registerMobileApi(app: Express) {
  app.options("/api/mobile/dashboard", (_request, response) => {
    setMobileHeaders(response);
    response.status(204).end();
  });

  app.get("/api/mobile/dashboard", async (_request, response) => {
    setMobileHeaders(response);
    try {
      const [categories, tasks, directReports] = await Promise.all([getAllCategories(), getAllTasks(), getAllDirectReports()]);
      response.json({ categories, tasks, directReports, syncedAt: Date.now() });
    } catch (error) {
      console.error("[Mobile API] Dashboard load failed", error);
      response.status(500).json({ error: "Unable to load dashboard data" });
    }
  });
}
