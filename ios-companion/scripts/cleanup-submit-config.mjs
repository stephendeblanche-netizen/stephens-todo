import { existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const backupPath = resolve(root, "eas.submit-backup.json");
const easPath = resolve(root, "eas.json");
if (existsSync(backupPath)) renameSync(backupPath, easPath);
rmSync("/tmp/stephens-todo-app-store-connect-submit-key.p8", { force: true });
