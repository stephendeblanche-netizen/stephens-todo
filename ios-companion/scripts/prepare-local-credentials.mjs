import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const signingDir = "/home/ubuntu/ios-signing-assets";
const certificatePath = `${signingDir}/stephens-todo-reminders-eas.p12`;
const certificatePassword = randomBytes(24).toString("base64url");
execFileSync("openssl", [
  "pkcs12", "-export",
  "-legacy",
  "-macalg", "sha1",
  "-certpbe", "PBE-SHA1-3DES",
  "-keypbe", "PBE-SHA1-3DES",
  "-inkey", `${signingDir}/stephens-todo-ios-distribution.key`,
  "-in", `${signingDir}/stephens-todo-ios-distribution.pem`,
  "-out", certificatePath,
  "-passout", `pass:${certificatePassword}`,
]);
const credentials = {
  ios: {
    provisioningProfilePath: "/home/ubuntu/upload/pasted_file_Hat0pF_Stephens_ToDo_App_Store(1).mobileprovision",
    distributionCertificate: {
      path: certificatePath,
      password: certificatePassword,
    },
  },
};

writeFileSync(resolve(import.meta.dirname, "..", "credentials.json"), `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
