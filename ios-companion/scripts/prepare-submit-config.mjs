import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const required = ["APP_STORE_CONNECT_KEY_ID", "APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_PRIVATE_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required for the App Store Connect submission configuration.`);
}

let privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY.trim().replace(/\\n/g, "\n");
if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
  privateKey = privateKey.slice(1, -1);
}
if (!privateKey.includes("BEGIN PRIVATE KEY")) {
  privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.replace(/\s/g, "").match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
}

const root = resolve(import.meta.dirname, "..");
const easPath = resolve(root, "eas.json");
const backupPath = resolve(root, "eas.submit-backup.json");
const keyPath = "/tmp/stephens-todo-app-store-connect-submit-key.p8";
copyFileSync(easPath, backupPath);
writeFileSync(keyPath, `${privateKey}\n`, { mode: 0o600 });

const eas = JSON.parse(readFileSync(easPath, "utf8"));
eas.submit.production.ios = {
  ...eas.submit.production.ios,
  ascApiKeyPath: keyPath,
  ascApiKeyIssuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
  ascApiKeyId: process.env.APP_STORE_CONNECT_KEY_ID,
};
writeFileSync(easPath, `${JSON.stringify(eas, null, 2)}\n`);
