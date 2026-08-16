import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  getAllCategories: vi.fn(),
  getAllTasks: vi.fn(),
  getAllDirectReports: vi.fn(),
  getTasksByCategory: vi.fn(),
  updateTask: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock("./db", () => fixture);

import { registerMobileApi } from "./mobileApi";

type Handler = (request: any, response: any) => Promise<void> | void;

function createApp() {
  const routes = new Map<string, Handler>();
  return {
    routes,
    options: (path: string, handler: Handler) => routes.set(`OPTIONS ${path}`, handler),
    get: (path: string, handler: Handler) => routes.set(`GET ${path}`, handler),
    post: (path: string, handler: Handler) => routes.set(`POST ${path}`, handler),
    patch: (path: string, handler: Handler) => routes.set(`PATCH ${path}`, handler),
  };
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
  return response;
}

describe("mobile companion API", () => {
  beforeEach(() => {
    fixture.getAllCategories.mockReset().mockResolvedValue([{ id: 1, name: "URGENT" }]);
    fixture.getAllTasks.mockReset().mockResolvedValue([{ id: 4, text: "Review brief", categoryId: 1 }]);
    fixture.getAllDirectReports.mockReset().mockResolvedValue([{ id: 2, name: "Alex" }]);
    fixture.getTasksByCategory.mockReset().mockResolvedValue([]);
    fixture.updateTask.mockReset().mockResolvedValue(undefined);
    fixture.createTask.mockReset().mockResolvedValue(9);
  });

  it("returns the existing dashboard categories, tasks, and direct reports", async () => {
    const app = createApp();
    registerMobileApi(app as any);
    const response = createResponse();

    await app.routes.get("GET /api/mobile/dashboard")!({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(response.body).toEqual(expect.objectContaining({
      categories: [{ id: 1, name: "URGENT" }],
      tasks: [{ id: 4, text: "Review brief", categoryId: 1 }],
      directReports: [{ id: 2, name: "Alex" }],
    }));
  });

  it("validates and persists a mobile task completion update", async () => {
    const app = createApp();
    registerMobileApi(app as any);
    const response = createResponse();

    await app.routes.get("PATCH /api/mobile/tasks/:taskId")!({ params: { taskId: "4" }, body: { done: true } }, response);

    expect(response.statusCode).toBe(200);
    expect(fixture.updateTask).toHaveBeenCalledWith(4, { done: true });
    expect(response.body).toEqual({ success: true });
  });

  it("rejects malformed mobile task updates", async () => {
    const app = createApp();
    registerMobileApi(app as any);
    const response = createResponse();

    await app.routes.get("PATCH /api/mobile/tasks/:taskId")!({ params: { taskId: "4" }, body: { priority: "critical" } }, response);

    expect(response.statusCode).toBe(400);
    expect(fixture.updateTask).not.toHaveBeenCalled();
  });
});
