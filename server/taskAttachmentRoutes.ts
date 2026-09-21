import express, { type Express } from "express";
import { createTaskAttachment, getTaskById } from "./db";
import { storagePut } from "./storage";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function safeFileName(value: string) {
  const decoded = decodeURIComponent(value || "attachment");
  return decoded
    .replace(/[\\/\0]/g, "-")
    .replace(/[^a-zA-Z0-9._() -]/g, "_")
    .trim()
    .slice(0, 255) || "attachment";
}

function isAllowedContentType(contentType: string) {
  return contentType.startsWith("image/") || ALLOWED_CONTENT_TYPES.has(contentType);
}

/**
 * Receives one selected attachment at a time and persists only its metadata in
 * MySQL. Object bytes are kept in the project's protected storage layer.
 */
export function registerTaskAttachmentRoutes(app: Express) {
  app.post(
    "/api/tasks/:taskId/attachments",
    express.raw({ type: "*/*", limit: MAX_ATTACHMENT_BYTES }),
    async (request, response) => {
      const taskId = Number(request.params.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        response.status(400).json({ error: "A valid task is required." });
        return;
      }

      const task = await getTaskById(taskId);
      if (!task) {
        response.status(404).json({ error: "The selected task no longer exists." });
        return;
      }

      const bytes = request.body as Buffer | undefined;
      if (!bytes || !Buffer.isBuffer(bytes) || bytes.length === 0) {
        response.status(400).json({ error: "Select a non-empty file to attach." });
        return;
      }
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        response.status(413).json({ error: "Each attachment must be 10 MB or smaller." });
        return;
      }

      const contentType = request.header("content-type")?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
      if (!isAllowedContentType(contentType)) {
        response.status(415).json({ error: "Attach a PDF, office document, spreadsheet, text file, or image." });
        return;
      }

      const fileName = safeFileName(request.header("x-file-name") || "attachment");
      try {
        const stored = await storagePut(`task-attachments/${taskId}/${fileName}`, bytes, contentType);
        const attachment = await createTaskAttachment({
          taskId,
          fileName,
          storageKey: stored.key,
          contentType,
          sizeBytes: bytes.length,
        });
        response.status(201).json({ attachment: { ...attachment, url: stored.url } });
      } catch (error) {
        console.error("[TaskAttachments] upload failed", error);
        response.status(500).json({ error: "The attachment could not be saved. Please try again." });
      }
    },
  );
}

export { MAX_ATTACHMENT_BYTES };
