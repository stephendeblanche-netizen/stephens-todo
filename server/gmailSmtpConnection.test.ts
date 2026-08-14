import { afterEach, describe, expect, it } from "vitest";
import tls from "node:tls";

const originalSmtpUser = process.env.GMAIL_SMTP_USER;
const originalSmtpAppPassword = process.env.GMAIL_SMTP_APP_PASSWORD;

async function verifyGmailSmtpCredentials(user: string, appPassword: string) {
  return new Promise<void>((resolve, reject) => {
    const socket = tls.connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
    let buffer = "";
    let authenticated = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      socket.destroy();
      reject(new Error("Timed out while validating the Gmail SMTP credential."));
    }, 20_000);

    const finish = (error?: Error) => {
      clearTimeout(timeout);
      socket.end();
      if (error) reject(error);
      else resolve();
    };

    socket.on("error", (error) => {
      if (!timedOut) finish(error);
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("220")) {
          socket.write("EHLO stephens-todo.local\r\n");
        } else if (line.startsWith("250 ") && !authenticated) {
          authenticated = true;
          const credential = Buffer.from(`\u0000${user}\u0000${appPassword.replace(/\s/g, "")}`).toString("base64");
          socket.write(`AUTH PLAIN ${credential}\r\n`);
        } else if (line.startsWith("235")) {
          finish();
        } else if (line.startsWith("535") || line.startsWith("534")) {
          finish(new Error("Gmail rejected the configured App Password."));
        }
      }
    });
  });
}

describe("Gmail SMTP credentials", () => {
  afterEach(() => {
    if (originalSmtpUser === undefined) delete process.env.GMAIL_SMTP_USER;
    else process.env.GMAIL_SMTP_USER = originalSmtpUser;
    if (originalSmtpAppPassword === undefined) delete process.env.GMAIL_SMTP_APP_PASSWORD;
    else process.env.GMAIL_SMTP_APP_PASSWORD = originalSmtpAppPassword;
  });

  it("authenticates the configured sender without sending an email", async () => {
    const user = process.env.GMAIL_SMTP_USER;
    const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
    expect(user).toBe("stephen.deblanche@gmail.com");
    expect(appPassword).toBeTruthy();
    await verifyGmailSmtpCredentials(user!, appPassword!);
  }, 25_000);
});
