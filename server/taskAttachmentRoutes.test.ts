import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTaskById: vi.fn(),
  createTaskAttachment: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  getTaskById: mocks.getTaskById,
  createTaskAttachment: mocks.createTaskAttachment,
}));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut }));

import { registerTaskAttachmentRoutes } from "./taskAttachmentRoutes";

describe("task attachment upload route", () => {
  let server: ReturnType<express.Express["listen"]> | undefined;

  beforeEach(() => {
    mocks.getTaskById.mockResolvedValue({ id: 4, text: "Prepare pack" });
    mocks.storagePut.mockResolvedValue({ key: "task-attachments/4/board-pack_abcd1234.pdf", url: "/manus-storage/task-attachments/4/board-pack_abcd1234.pdf" });
    mocks.createTaskAttachment.mockResolvedValue({
      id: 9,
      taskId: 4,
      fileName: "Board pack.pdf",
      storageKey: "task-attachments/4/board-pack_abcd1234.pdf",
      contentType: "application/pdf",
      sizeBytes: 4,
      createdAt: new Date(),
    });
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  async function endpoint() {
    const app = express();
    registerTaskAttachmentRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected numeric test server port");
    return `http://127.0.0.1:${address.port}`;
  }

  it("stores an allowed task file in project storage and persists only metadata", async () => {
    const baseUrl = await endpoint();
    const response = await fetch(`${baseUrl}/api/tasks/4/attachments`, {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("Board pack.pdf") },
      body: Buffer.from("%PDF"),
    });

    expect(response.status).toBe(201);
    expect(mocks.storagePut).toHaveBeenCalledWith("task-attachments/4/Board pack.pdf", expect.any(Buffer), "application/pdf");
    expect(mocks.createTaskAttachment).toHaveBeenCalledWith(expect.objectContaining({ taskId: 4, fileName: "Board pack.pdf", sizeBytes: 4 }));
    await expect(response.json()).resolves.toMatchObject({ attachment: { id: 9, url: "/manus-storage/task-attachments/4/board-pack_abcd1234.pdf" } });
  });

  it("rejects unsupported files before object storage is called", async () => {
    const baseUrl = await endpoint();
    const response = await fetch(`${baseUrl}/api/tasks/4/attachments`, {
      method: "POST",
      headers: { "content-type": "application/x-msdownload", "x-file-name": "unsafe.exe" },
      body: Buffer.from("binary"),
    });

    expect(response.status).toBe(415);
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });
});
