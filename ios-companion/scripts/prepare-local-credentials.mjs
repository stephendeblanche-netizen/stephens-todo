import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const signingDir = "/home/ubuntu/ios-signing-assets";
const sourcePackagePath =
  process.env.IOS_SIGNING_SOURCE_PACKAGE_PATH ??
  "/home/ubuntu/upload/pasted_file_4SsC9T_stephens-todo-distribution.p12.pfx";
const provisioningProfilePath =
  process.env.IOS_SIGNING_PROVISIONING_PROFILE_PATH ??
  "/home/ubuntu/upload/pasted_file_qV7fbD_Stephens_ToDo_App_Store(3).mobileprovision";
const sourcePackagePassword = process.env.IOS_DISTRIBUTION_P12_PASSWORD;

if (!sourcePackagePassword) {
  throw new Error("IOS_DISTRIBUTION_P12_PASSWORD is required to prepare signing credentials.");
}

mkdirSync(signingDir, { recursive: true, mode: 0o700 });

const privateKeyPath = `${signingDir}/stephens-todo-ios-distribution.key`;
const certificatePath = `${signingDir}/stephens-todo-ios-distribution.pem`;
const easPackagePath = `${signingDir}/stephens-todo-reminders-eas.p12`;
const easPackagePassword = randomBytes(24).toString("base64url");

execFileSync("openssl", [
  "pkcs12",
  "-in",
  sourcePackagePath,
  "-nocerts",
  "-nodes",
  "-passin",
  `pass:${sourcePackagePassword}`,
  "-out",
  privateKeyPath,
]);
execFileSync("openssl", [
  "pkcs12",
  "-in",
  sourcePackagePath,
  "-clcerts",
  "-nokeys",
  "-passin",
  `pass:${sourcePackagePassword}`,
  "-out",
  certificatePath,
]);
execFileSync("openssl", [
  "pkcs12",
  "-export",
  "-legacy",
  "-macalg",
  "sha1",
  "-certpbe",
  "PBE-SHA1-3DES",
  "-keypbe",
  "PBE-SHA1-3DES",
  "-inkey",
  privateKeyPath,
  "-in",
  certificatePath,
  "-out",
  easPackagePath,
  "-passout",
  `pass:${easPackagePassword}`,
]);

for (const path of [privateKeyPath, certificatePath, easPackagePath]) {
  chmodSync(path, 0o600);
}

const credentials = {
  ios: {
    provisioningProfilePath,
    distributionCertificate: {
      path: easPackagePath,
      password: easPackagePassword,
    },
  },
};

const credentialsPath = resolve(import.meta.dirname, "..", "credentials.json");
writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
chmodSync(credentialsPath, 0o600);
