import { importPKCS8, SignJWT } from "jose";

const [mode = "status"] = process.argv.slice(2);
const bundleIdentifier = "com.stephendeblanche.stephenstodo";
const appName = "Stephen's To-Do Dashboard";
const sku = "stephens-todo-ios";

function privateKeyFromEnvironment() {
  const configuredKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!configuredKey) throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is not configured.");
  return configuredKey.includes("BEGIN PRIVATE KEY")
    ? configuredKey
    : `-----BEGIN PRIVATE KEY-----\n${configuredKey.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function token() {
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  if (!keyId || !issuerId) throw new Error("App Store Connect Key ID and Issuer ID are required.");
  const privateKey = await importPKCS8(privateKeyFromEnvironment(), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`App Store Connect returned HTTP ${response.status}: ${JSON.stringify(body.errors ?? body)}`);
  return body;
}

const bundleIds = await api(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleIdentifier)}`);
const bundleId = bundleIds.data?.[0];
if (!bundleId) throw new Error(`No App Store Connect bundle ID found for ${bundleIdentifier}.`);

if (mode === "list") {
  const allApps = await api("/v1/apps?limit=200");
  console.log(JSON.stringify(allApps.data.map(({ id, attributes }) => ({ id, name: attributes.name, sku: attributes.sku })), null, 2));
  process.exit(0);
}

const appsByBundleId = await api(`/v1/apps?filter[bundleId]=${bundleId.id}`);
const apps = appsByBundleId.data?.length ? appsByBundleId : await api(`/v1/apps?filter[sku]=${encodeURIComponent(sku)}`);
let app = apps.data?.[0];

if (mode === "builds") {
  if (!app) throw new Error(`No App Store Connect app record found for SKU ${sku}.`);
  const builds = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10`);
  console.log(JSON.stringify(builds.data.map(({ id, attributes }) => ({
    id,
    version: attributes.version,
    uploadedDate: attributes.uploadedDate,
    processingState: attributes.processingState,
    expired: attributes.expired,
  })), null, 2));
  process.exit(0);
}

if (!app && mode === "create") {
  const created = await api("/v1/apps", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "apps",
        attributes: { name: appName, primaryLocale: "en-US", sku },
        relationships: { bundleId: { data: { type: "bundleIds", id: bundleId.id } } },
      },
    }),
  });
  app = created.data;
}

console.log(JSON.stringify({
  bundleIdentifier,
  bundleId: bundleId.id,
  app: app ? { id: app.id, name: app.attributes.name, sku: app.attributes.sku } : null,
  created: mode === "create" && Boolean(app),
}, null, 2));
