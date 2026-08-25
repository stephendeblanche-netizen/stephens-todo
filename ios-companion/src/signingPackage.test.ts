import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signingPackagePath =
  process.env.IOS_DISTRIBUTION_P12_PATH ??
  "/home/ubuntu/upload/pasted_file_4SsC9T_stephens-todo-distribution.p12.pfx";
const signingPassword = process.env.IOS_DISTRIBUTION_P12_PASSWORD;
const canValidate = Boolean(signingPassword) && existsSync(signingPackagePath);

describe("replacement iOS signing package", () => {
  it.skipIf(!canValidate)("accepts the configured PKCS#12 export password", () => {
    const certificatePem = execFileSync(
      "openssl",
      [
        "pkcs12",
        "-in",
        signingPackagePath,
        "-clcerts",
        "-nokeys",
        "-passin",
        `pass:${signingPassword}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );

    expect(certificatePem).toContain("BEGIN CERTIFICATE");
  });
});
